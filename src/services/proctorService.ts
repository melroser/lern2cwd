/**
 * ProctorService - Handles AI proctor interactions
 * 
 * This service manages all interactions with the AI proctor including:
 * - Generating problem introductions
 * - Responding to user questions during the session
 * - Evaluating code submissions
 * 
 * Supports two modes:
 * - Live LLM mode: Uses real API calls when an API key is configured
 * - Mock mode: Returns hardcoded responses for testing when no API key is available
 * 
 * Requirements: 3.2, 4.1
 */

import type {
  EvaluationAnnotation,
  Problem,
  SessionContext,
  ChatMessage,
  EvaluationResult,
  ProctorService as IProctorService,
  ProctorInteractionMode,
  MissTag,
} from '../types';
import { getConfiguredApiKey, hasApiKey } from '../utils/apiKeyStorage';
import {
  buildLiveChatPrompt,
  buildEvaluationPrompt,
} from '../prompts/proctorPrompts';
import { evaluationService, EvaluationParseError } from './evaluationService';

// =============================================================================
// Constants
// =============================================================================

/**
 * OpenAI API endpoint for chat completions
 */
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Default model to use for LLM calls
 */
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Maximum retry attempts for API calls
 */
const MAX_RETRIES = 2;

/**
 * Delay between retries in milliseconds
 */
const RETRY_DELAY_MS = 1000;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Simulates API latency for realistic UI testing in mock mode
 * @param minMs Minimum delay in milliseconds
 * @param maxMs Maximum delay in milliseconds
 */
function simulateLatency(minMs: number = 500, maxMs: number = 1000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Derive miss tags from scores when LLM omits them
 * 
 * Fallback rules from design.md:
 * - completeness ≤ 2 → edge-cases or incomplete-solution
 * - complexity ≤ 2 → complexity-analysis
 * - communication ≤ 2 → unclear-communication
 * - approach ≤ 2 → incorrect-approach
 */
function deriveMissTagsFromScores(scores: EvaluationResult['scores']): MissTag[] {
  const tags: MissTag[] = [];

  if (scores.completeness <= 2) {
    tags.push('edge-cases');
    if (scores.completeness <= 1) {
      tags.push('incomplete-solution');
    }
  }

  if (scores.complexity <= 2) {
    tags.push('complexity-analysis');
  }

  if (scores.communication <= 2) {
    tags.push('unclear-communication');
  }

  if (scores.approach <= 2) {
    tags.push('incorrect-approach');
  }

  // Return max 4 tags
  return tags.slice(0, 4);
}

const CODE_KEYWORD_PATTERNS: Record<string, RegExp> = {
  'hash-map': /\b(dict|defaultdict|hash|map|seen)\b/i,
  set: /\bset\(/i,
  'two-pointers': /\bleft\b|\bright\b|while\s+\w+\s*[<>]=?\s*\w+/i,
  'sliding-window': /\bwindow\b|\bleft\b.*\bright\b|\bright\s*-\s*left/i,
  stack: /\bstack\b|append\(|pop\(/i,
  'binary-search': /\bmid\b|while\s+\w+\s*<=\s*\w+/i,
  dfs: /\bdfs\b|def\s+dfs|recursive/i,
  bfs: /\bdeque\b|\bqueue\b|popleft\(/i,
  'dynamic-programming': /\bdp\b|memo|cache/i,
  sorting: /sort\(|sorted\(/i,
  heap: /\bheapq\b|heappush|heappop/i,
  'prefix-suffix': /\bprefix\b|\bsuffix\b/i,
};

function getReviewCommentPrefix(problem: Problem): string {
  if (problem.language === 'javascript' || problem.language === 'typescript') {
    return '// Review:';
  }
  if (problem.language === 'sql') {
    return '-- Review:';
  }
  return '# Review:';
}

function clampReviewLine(line: number, totalLines: number): number {
  return Math.max(1, Math.min(totalLines, line));
}

function pushAnnotation(
  annotations: EvaluationAnnotation[],
  annotation: EvaluationAnnotation
): void {
  const exists = annotations.some((entry) => (
    entry.target === annotation.target &&
    entry.line === annotation.line &&
    entry.message === annotation.message
  ));

  if (!exists) {
    annotations.push(annotation);
  }
}

function findFirstLine(lines: string[], pattern: RegExp): number | null {
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : null;
}

function buildFallbackAnnotations(
  problem: Problem,
  candidateCode: string,
  idealSolution: string,
  feedback: EvaluationResult['feedback'],
  missTags: MissTag[]
): EvaluationAnnotation[] {
  const annotations: EvaluationAnnotation[] = [];
  const candidateLines = candidateCode.length > 0 ? candidateCode.split('\n') : [''];
  const idealLines = idealSolution.length > 0 ? idealSolution.split('\n') : [''];
  const totalCandidateLines = candidateLines.length;
  const totalIdealLines = idealLines.length;

  const placeholderLine = findFirstLine(candidateLines, /\b(pass|todo|TODO)\b/);
  const nestedLoopLine = findFirstLine(candidateLines, /for[\s\S]{0,80}for/);
  const returnLine = findFirstLine(candidateLines, /\breturn\b/);
  const plusOneLine = findFirstLine(candidateLines, /\+\s*1|\-\s*1/);
  const idealLoopLine = findFirstLine(idealLines, /\bwhile\b|\bfor\b/);
  const idealReturnLine = findFirstLine(idealLines, /\breturn\b/);
  const commentPrefix = getReviewCommentPrefix(problem);

  if (feedback.improvements[0]) {
    pushAnnotation(annotations, {
      target: 'candidate',
      line: clampReviewLine(placeholderLine ?? returnLine ?? 1, totalCandidateLines),
      message: `${commentPrefix} ${feedback.improvements[0]}`,
      severity: 'warning',
    });
  }

  if (missTags.includes('incomplete-solution')) {
    pushAnnotation(annotations, {
      target: 'candidate',
      line: clampReviewLine(placeholderLine ?? totalCandidateLines, totalCandidateLines),
      message: `${commentPrefix} This draft is still incomplete at this point.`,
      severity: 'error',
    });
  }

  if (missTags.includes('edge-cases')) {
    pushAnnotation(annotations, {
      target: 'candidate',
      line: clampReviewLine(returnLine ?? totalCandidateLines, totalCandidateLines),
      message: `${commentPrefix} Re-check empty input and smallest valid case before returning.`,
      severity: 'warning',
    });
  }

  if (missTags.includes('complexity-analysis')) {
    pushAnnotation(annotations, {
      target: 'candidate',
      line: clampReviewLine(nestedLoopLine ?? 1, totalCandidateLines),
      message: `${commentPrefix} Call out runtime and confirm this matches the interview target.`,
      severity: 'info',
    });
  }

  if (missTags.includes('off-by-one')) {
    pushAnnotation(annotations, {
      target: 'candidate',
      line: clampReviewLine(plusOneLine ?? 1, totalCandidateLines),
      message: `${commentPrefix} Double-check indexing and 1-based vs 0-based expectations here.`,
      severity: 'warning',
    });
  }

  pushAnnotation(annotations, {
    target: 'ideal',
    line: 1,
    message: `${commentPrefix} Optimal approach: ${problem.expectedApproach}`,
    severity: 'info',
  });

  if (problem.tutorPlan?.complexityTarget) {
    pushAnnotation(annotations, {
      target: 'ideal',
      line: clampReviewLine(idealLoopLine ?? idealReturnLine ?? 1, totalIdealLines),
      message: `${commentPrefix} This keeps the solution within the target ${problem.tutorPlan.complexityTarget} range.`,
      severity: 'info',
    });
  } else if (idealReturnLine) {
    pushAnnotation(annotations, {
      target: 'ideal',
      line: clampReviewLine(idealReturnLine, totalIdealLines),
      message: `${commentPrefix} Notice how the final return cleanly matches the function contract.`,
      severity: 'info',
    });
  }

  return annotations.slice(0, 6);
}

const CURATED_IDEAL_SOLUTIONS: Record<string, string> = {
  'codesignal-first-duplicate': `def first_duplicate(a: list[int]) -> int:
    seen = set()

    for value in a:
      if value in seen:
        return value
      seen.add(value)

    return -1

# Time complexity: O(n)
# Space complexity: O(n)`,

  'codesignal-rotate-image': `def rotate_image(a: list[list[int]]) -> list[list[int]]:
    n = len(a)

    # Transpose in place
    for i in range(n):
      for j in range(i + 1, n):
        a[i][j], a[j][i] = a[j][i], a[i][j]

    # Reverse each row
    for row in a:
      row.reverse()

    return a

# Time complexity: O(n^2)
# Space complexity: O(1) extra`,

  'codesignal-sudoku2': `def sudoku2(grid: list[str]) -> bool:
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]

    for r in range(9):
      for c in range(9):
        ch = grid[r][c]
        if ch == '.':
          continue
        box = (r // 3) * 3 + (c // 3)
        if ch in rows[r] or ch in cols[c] or ch in boxes[box]:
          return False
        rows[r].add(ch)
        cols[c].add(ch)
        boxes[box].add(ch)

    return True

# Time complexity: O(1) for fixed 9x9 board
# Space complexity: O(1)`,

  'codesignal-is-crypt-solution': `def is_crypt_solution(crypt: list[str], solution: list[list[str]]) -> bool:
    mapping = {ch: digit for ch, digit in solution}

    def decode(word: str) -> int | None:
      number = ''.join(mapping[ch] for ch in word)
      if len(number) > 1 and number[0] == '0':
        return None
      return int(number)

    a = decode(crypt[0])
    b = decode(crypt[1])
    c = decode(crypt[2])
    if a is None or b is None or c is None:
      return False
    return a + b == c

# Time complexity: O(total characters)
# Space complexity: O(unique letters)`,

  'codesignal-sort-by-height': `def sort_by_height(a: list[int]) -> list[int]:
    people = sorted(value for value in a if value != -1)
    idx = 0
    result = []

    for value in a:
      if value == -1:
        result.append(-1)
      else:
        result.append(people[idx])
        idx += 1

    return result

# Time complexity: O(n log n)
# Space complexity: O(n)`,

  'codesignal-are-similar': `def are_similar(a: list[int], b: list[int]) -> bool:
    mismatches = []

    for i in range(len(a)):
      if a[i] != b[i]:
        mismatches.append(i)
      if len(mismatches) > 2:
        return False

    if len(mismatches) == 0:
      return True
    if len(mismatches) != 2:
      return False

    i, j = mismatches
    return a[i] == b[j] and a[j] == b[i]

# Time complexity: O(n)
# Space complexity: O(1)`,

  'codesignal-array-change': `def array_change(input_array: list[int]) -> int:
    moves = 0

    for i in range(1, len(input_array)):
      if input_array[i] <= input_array[i - 1]:
        needed = input_array[i - 1] + 1 - input_array[i]
        input_array[i] += needed
        moves += needed

    return moves

# Time complexity: O(n)
# Space complexity: O(1)`,

  'codesignal-palindrome-rearranging': `from collections import Counter

def palindrome_rearranging(s: str) -> bool:
    counts = Counter(s)
    odd_count = sum(1 for value in counts.values() if value % 2 == 1)
    return odd_count <= 1

# Time complexity: O(n)
# Space complexity: O(k), where k = distinct characters`,

  'codesignal-avoid-obstacles': `def avoid_obstacles(input_array: list[int]) -> int:
    obstacles = set(input_array)
    jump = 2

    while True:
      if all(position % jump != 0 for position in obstacles):
        return jump
      jump += 1

# Time complexity: O(m * j) in practice (m obstacles, j tested jumps)
# Space complexity: O(m)`,

  'codesignal-box-blur': `def box_blur(image: list[list[int]]) -> list[list[int]]:
    rows = len(image)
    cols = len(image[0])
    result = []

    for r in range(rows - 2):
      row = []
      for c in range(cols - 2):
        total = 0
        for dr in range(3):
          for dc in range(3):
            total += image[r + dr][c + dc]
        row.append(total // 9)
      result.append(row)

    return result

# Time complexity: O((r-2)*(c-2)*9) ~= O(r*c)
# Space complexity: O((r-2)*(c-2)) for output`,

  'codesignal-minesweeper': `def minesweeper(matrix: list[list[bool]]) -> list[list[int]]:
    rows = len(matrix)
    cols = len(matrix[0])
    result = [[0] * cols for _ in range(rows)]
    directions = [
      (-1, -1), (-1, 0), (-1, 1),
      (0, -1),           (0, 1),
      (1, -1),  (1, 0),  (1, 1),
    ]

    for r in range(rows):
      for c in range(cols):
        count = 0
        for dr, dc in directions:
          nr = r + dr
          nc = c + dc
          if 0 <= nr < rows and 0 <= nc < cols and matrix[nr][nc]:
            count += 1
        result[r][c] = count

    return result

# Time complexity: O(r*c)
# Space complexity: O(r*c) for output`,

  'codesignal-array-max-consecutive-sum': `def array_max_consecutive_sum(input_array: list[int], k: int) -> int:
    window_sum = sum(input_array[:k])
    best = window_sum

    for right in range(k, len(input_array)):
      window_sum += input_array[right]
      window_sum -= input_array[right - k]
      best = max(best, window_sum)

    return best

# Time complexity: O(n)
# Space complexity: O(1)`,

  'codesignal-digits-product': `def digits_product(product: int) -> int:
    if product == 0:
      return 10
    if product == 1:
      return 1

    digits = []
    for d in range(9, 1, -1):
      while product % d == 0:
        digits.append(str(d))
        product //= d

    if product != 1:
      return -1

    return int(''.join(reversed(digits)))

# Time complexity: O(log product)
# Space complexity: O(log product)`,

  'codesignal-file-naming': `def file_naming(names: list[str]) -> list[str]:
    used = set()
    result = []

    for name in names:
      if name not in used:
        used.add(name)
        result.append(name)
        continue

      suffix = 1
      while f"{name}({suffix})" in used:
        suffix += 1
      candidate = f"{name}({suffix})"
      used.add(candidate)
      result.append(candidate)

    return result

# Time complexity: near O(n) average, worst-case higher with many collisions
# Space complexity: O(n)`,

  'codesignal-delete-digit': `def delete_digit(n: int) -> int:
    s = str(n)
    best = 0

    for i in range(len(s)):
      candidate = int(s[:i] + s[i + 1:])
      best = max(best, candidate)

    return best

# Time complexity: O(d^2) with string slicing, d = number of digits
# Space complexity: O(d)`,

  'codesignal-build-palindrome': `def build_palindrome(st: str) -> str:
    # Find shortest suffix we can mirror to finish a palindrome.
    for i in range(len(st)):
      suffix = st[i:]
      if suffix == suffix[::-1]:
        return st + st[:i][::-1]
    return st

# Time complexity: O(n^2) worst-case
# Space complexity: O(n)`,

  'codesignal-map-decoding': `def map_decoding(message: str) -> int:
    if not message or message[0] == '0':
      return 0

    n = len(message)
    dp = [0] * (n + 1)
    dp[0] = 1
    dp[1] = 1

    for i in range(2, n + 1):
      one = int(message[i - 1:i])
      two = int(message[i - 2:i])

      if 1 <= one <= 9:
        dp[i] += dp[i - 1]
      if 10 <= two <= 26:
        dp[i] += dp[i - 2]

    return dp[n]

# Time complexity: O(n)
# Space complexity: O(n)`,

  'codesignal-compose-ranges': `def compose_ranges(nums: list[int]) -> list[str]:
    if not nums:
      return []

    result = []
    start = nums[0]
    prev = nums[0]

    for i in range(1, len(nums)):
      if nums[i] == prev + 1:
        prev = nums[i]
        continue
      result.append(str(start) if start == prev else f"{start}->{prev}")
      start = nums[i]
      prev = nums[i]

    result.append(str(start) if start == prev else f"{start}->{prev}")
    return result

# Time complexity: O(n)
# Space complexity: O(1) extra (excluding output)`,

  'codesignal-delivery-time': `import heapq

def delivery_time(n: int, roads: list[tuple[int, int, int]], start: int, target: int) -> int:
    graph = [[] for _ in range(n)]
    for u, v, w in roads:
      graph[u].append((v, w))
      graph[v].append((u, w))

    dist = [float('inf')] * n
    dist[start] = 0
    heap = [(0, start)]

    while heap:
      d, node = heapq.heappop(heap)
      if d > dist[node]:
        continue
      if node == target:
        return d
      for nxt, weight in graph[node]:
        nd = d + weight
        if nd < dist[nxt]:
          dist[nxt] = nd
          heapq.heappush(heap, (nd, nxt))

    return -1

# Time complexity: O((V + E) log V)
# Space complexity: O(V + E)`,

  'codesignal-feature-deployment-batches': `def feature_deployment_batches(progress: list[int], speed: list[int]) -> list[int]:
    days = []
    for p, s in zip(progress, speed):
      remaining = 100 - p
      day = (remaining + s - 1) // s
      days.append(day)

    batches = []
    current_release_day = days[0]
    count = 1

    for day in days[1:]:
      if day <= current_release_day:
        count += 1
      else:
        batches.append(count)
        current_release_day = day
        count = 1

    batches.append(count)
    return batches

# Time complexity: O(n)
# Space complexity: O(n)`,
};

const NEETCODE_CURATED_IDEAL_SOLUTIONS: Record<string, string> = {
  'neet-contains-duplicate': `def contains_duplicate(nums: list[int]) -> bool:
    return len(nums) != len(set(nums))

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-valid-anagram': `from collections import Counter

def valid_anagram(s: str, t: str) -> bool:
    if len(s) != len(t):
      return False
    return Counter(s) == Counter(t)

# Time complexity: O(n)
# Space complexity: O(k), k = alphabet size`,

  'neet-two-sum': `def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}

    for i, value in enumerate(nums):
      complement = target - value
      if complement in seen:
        return [seen[complement], i]
      seen[value] = i

    return []

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-group-anagrams': `from collections import defaultdict

def group_anagrams(strs: list[str]) -> list[list[str]]:
    groups = defaultdict(list)

    for word in strs:
      count = [0] * 26
      for ch in word:
        count[ord(ch) - ord('a')] += 1
      groups[tuple(count)].append(word)

    return list(groups.values())

# Time complexity: O(total chars)
# Space complexity: O(total chars)`,

  'neet-top-k-frequent-elements': `from collections import Counter

def top_k_frequent_elements(nums: list[int], k: int) -> list[int]:
    freq = Counter(nums)
    buckets = [[] for _ in range(len(nums) + 1)]

    for value, count in freq.items():
      buckets[count].append(value)

    result = []
    for count in range(len(buckets) - 1, 0, -1):
      for value in buckets[count]:
        result.append(value)
        if len(result) == k:
          return result

    return result

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-product-of-array-except-self': `def product_of_array_except_self(nums: list[int]) -> list[int]:
    n = len(nums)
    result = [1] * n

    prefix = 1
    for i in range(n):
      result[i] = prefix
      prefix *= nums[i]

    suffix = 1
    for i in range(n - 1, -1, -1):
      result[i] *= suffix
      suffix *= nums[i]

    return result

# Time complexity: O(n)
# Space complexity: O(1) extra (excluding output)`,

  'neet-valid-sudoku': `def valid_sudoku(board: list[list[str]]) -> bool:
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]

    for r in range(9):
      for c in range(9):
        value = board[r][c]
        if value == '.':
          continue

        box = (r // 3) * 3 + (c // 3)
        if value in rows[r] or value in cols[c] or value in boxes[box]:
          return False

        rows[r].add(value)
        cols[c].add(value)
        boxes[box].add(value)

    return True

# Time complexity: O(1) (fixed 9x9 board)
# Space complexity: O(1)`,

  'neet-encode-and-decode-strings': `def encode(strs: list[str]) -> str:
    return ''.join(f"{len(s)}#{s}" for s in strs)


def decode(s: str) -> list[str]:
    result = []
    i = 0

    while i < len(s):
      j = i
      while s[j] != '#':
        j += 1
      length = int(s[i:j])
      j += 1
      result.append(s[j:j + length])
      i = j + length

    return result

# Time complexity: O(total chars)
# Space complexity: O(total chars)`,

  'neet-longest-consecutive-sequence': `def longest_consecutive_sequence(nums: list[int]) -> int:
    values = set(nums)
    best = 0

    for value in values:
      if value - 1 in values:
        continue

      length = 1
      current = value
      while current + 1 in values:
        current += 1
        length += 1

      best = max(best, length)

    return best

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-valid-palindrome': `def valid_palindrome(s: str) -> bool:
    left = 0
    right = len(s) - 1

    while left < right:
      while left < right and not s[left].isalnum():
        left += 1
      while left < right and not s[right].isalnum():
        right -= 1

      if s[left].lower() != s[right].lower():
        return False

      left += 1
      right -= 1

    return True

# Time complexity: O(n)
# Space complexity: O(1)`,

  'neet-two-sum-ii-input-array-sorted': `def two_sum_ii_input_array_sorted(numbers: list[int], target: int) -> list[int]:
    left = 0
    right = len(numbers) - 1

    while left < right:
      total = numbers[left] + numbers[right]
      if total == target:
        return [left + 1, right + 1]
      if total < target:
        left += 1
      else:
        right -= 1

    return []

# Time complexity: O(n)
# Space complexity: O(1)`,

  'neet-3sum': `def three_sum(nums: list[int]) -> list[list[int]]:
    nums.sort()
    result = []

    for i in range(len(nums)):
      if i > 0 and nums[i] == nums[i - 1]:
        continue

      left = i + 1
      right = len(nums) - 1

      while left < right:
        total = nums[i] + nums[left] + nums[right]

        if total == 0:
          result.append([nums[i], nums[left], nums[right]])
          left += 1
          right -= 1

          while left < right and nums[left] == nums[left - 1]:
            left += 1
          while left < right and nums[right] == nums[right + 1]:
            right -= 1
        elif total < 0:
          left += 1
        else:
          right -= 1

    return result

# Time complexity: O(n^2)
# Space complexity: O(1) extra (excluding output)`,

  'neet-container-with-most-water': `def container_with_most_water(height: list[int]) -> int:
    left = 0
    right = len(height) - 1
    best = 0

    while left < right:
      area = (right - left) * min(height[left], height[right])
      best = max(best, area)

      if height[left] < height[right]:
        left += 1
      else:
        right -= 1

    return best

# Time complexity: O(n)
# Space complexity: O(1)`,

  'neet-trapping-rain-water': `def trapping_rain_water(height: list[int]) -> int:
    left = 0
    right = len(height) - 1
    left_max = 0
    right_max = 0
    trapped = 0

    while left < right:
      if height[left] < height[right]:
        left_max = max(left_max, height[left])
        trapped += left_max - height[left]
        left += 1
      else:
        right_max = max(right_max, height[right])
        trapped += right_max - height[right]
        right -= 1

    return trapped

# Time complexity: O(n)
# Space complexity: O(1)`,

  'neet-best-time-to-buy-and-sell-stock': `def best_time_to_buy_and_sell_stock(prices: list[int]) -> int:
    min_price = float('inf')
    best_profit = 0

    for price in prices:
      min_price = min(min_price, price)
      best_profit = max(best_profit, price - min_price)

    return best_profit

# Time complexity: O(n)
# Space complexity: O(1)`,

  'neet-longest-substring-without-repeating-characters': `def longest_substring_without_repeat(s: str) -> int:
    last_seen = {}
    left = 0
    best = 0

    for right, ch in enumerate(s):
      if ch in last_seen and last_seen[ch] >= left:
        left = last_seen[ch] + 1
      last_seen[ch] = right
      best = max(best, right - left + 1)

    return best

# Time complexity: O(n)
# Space complexity: O(min(n, charset))`,

  'neet-longest-repeating-character-replacement': `def longest_repeating_character_repl(s: str, k: int) -> int:
    counts = {}
    left = 0
    max_count = 0
    best = 0

    for right, ch in enumerate(s):
      counts[ch] = counts.get(ch, 0) + 1
      max_count = max(max_count, counts[ch])

      while (right - left + 1) - max_count > k:
        counts[s[left]] -= 1
        left += 1

      best = max(best, right - left + 1)

    return best

# Time complexity: O(n)
# Space complexity: O(1) for uppercase alphabet`,

  'neet-permutation-in-string': `def permutation_in_string(s1: str, s2: str) -> bool:
    if len(s1) > len(s2):
      return False

    target = [0] * 26
    window = [0] * 26

    for ch in s1:
      target[ord(ch) - ord('a')] += 1

    for i, ch in enumerate(s2):
      window[ord(ch) - ord('a')] += 1

      if i >= len(s1):
        left_char = s2[i - len(s1)]
        window[ord(left_char) - ord('a')] -= 1

      if window == target:
        return True

    return False

# Time complexity: O(n)
# Space complexity: O(1)`,

  'neet-minimum-window-substring': `from collections import Counter

def minimum_window_substring(s: str, t: str) -> str:
    if not t or not s:
      return ''

    need = Counter(t)
    have = {}
    required = len(need)
    formed = 0
    left = 0
    best = (float('inf'), 0, 0)

    for right, ch in enumerate(s):
      have[ch] = have.get(ch, 0) + 1
      if ch in need and have[ch] == need[ch]:
        formed += 1

      while formed == required:
        if right - left + 1 < best[0]:
          best = (right - left + 1, left, right)

        left_char = s[left]
        have[left_char] -= 1
        if left_char in need and have[left_char] < need[left_char]:
          formed -= 1
        left += 1

    if best[0] == float('inf'):
      return ''
    return s[best[1]:best[2] + 1]

# Time complexity: O(|s| + |t|)
# Space complexity: O(|charset|)`,

  'neet-sliding-window-maximum': `from collections import deque

def sliding_window_maximum(nums: list[int], k: int) -> list[int]:
    dq = deque()  # stores indices
    result = []

    for i, value in enumerate(nums):
      while dq and dq[0] <= i - k:
        dq.popleft()
      while dq and nums[dq[-1]] <= value:
        dq.pop()

      dq.append(i)
      if i >= k - 1:
        result.append(nums[dq[0]])

    return result

# Time complexity: O(n)
# Space complexity: O(k)`,

  'neet-valid-parentheses': `def valid_parentheses(s: str) -> bool:
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []

    for ch in s:
      if ch in pairs.values():
        stack.append(ch)
      elif ch in pairs:
        if not stack or stack.pop() != pairs[ch]:
          return False

    return len(stack) == 0

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-min-stack': `class MinStack:
    def __init__(self):
      self.stack = []
      self.min_stack = []

    def push(self, val: int) -> None:
      self.stack.append(val)
      if not self.min_stack:
        self.min_stack.append(val)
      else:
        self.min_stack.append(min(val, self.min_stack[-1]))

    def pop(self) -> None:
      self.stack.pop()
      self.min_stack.pop()

    def top(self) -> int:
      return self.stack[-1]

    def get_min(self) -> int:
      return self.min_stack[-1]

# All operations run in O(1) time`,

  'neet-evaluate-reverse-polish-notation': `def evaluate_reverse_polish_notation(tokens: list[str]) -> int:
    stack = []

    for token in tokens:
      if token in {'+', '-', '*', '/'}:
        b = stack.pop()
        a = stack.pop()

        if token == '+':
          stack.append(a + b)
        elif token == '-':
          stack.append(a - b)
        elif token == '*':
          stack.append(a * b)
        else:
          stack.append(int(a / b))  # truncates toward zero
      else:
        stack.append(int(token))

    return stack[-1]

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-generate-parentheses': `def generate_parentheses(n: int) -> list[str]:
    result = []

    def backtrack(open_count: int, close_count: int, current: list[str]) -> None:
      if len(current) == 2 * n:
        result.append(''.join(current))
        return

      if open_count < n:
        current.append('(')
        backtrack(open_count + 1, close_count, current)
        current.pop()

      if close_count < open_count:
        current.append(')')
        backtrack(open_count, close_count + 1, current)
        current.pop()

    backtrack(0, 0, [])
    return result

# Time complexity: O(Catalan(n))
# Space complexity: O(n) recursion depth`,

  'neet-daily-temperatures': `def daily_temperatures(temperatures: list[int]) -> list[int]:
    result = [0] * len(temperatures)
    stack = []  # indices with decreasing temperatures

    for i, temp in enumerate(temperatures):
      while stack and temperatures[stack[-1]] < temp:
        prev = stack.pop()
        result[prev] = i - prev
      stack.append(i)

    return result

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-car-fleet': `def car_fleet(target: int, position: list[int], speed: list[int]) -> int:
    cars = sorted(zip(position, speed), reverse=True)
    fleets = 0
    last_time = 0.0

    for pos, spd in cars:
      time = (target - pos) / spd
      if time > last_time:
        fleets += 1
        last_time = time

    return fleets

# Time complexity: O(n log n)
# Space complexity: O(n)`,

  'neet-largest-rectangle-in-histogram': `def largest_rectangle_in_histogram(heights: list[int]) -> int:
    stack = []  # (start_index, height)
    best = 0

    for i, h in enumerate(heights):
      start = i
      while stack and stack[-1][1] > h:
        index, height = stack.pop()
        best = max(best, height * (i - index))
        start = index
      stack.append((start, h))

    n = len(heights)
    for index, height in stack:
      best = max(best, height * (n - index))

    return best

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-binary-search': `def binary_search(nums: list[int], target: int) -> int:
    left = 0
    right = len(nums) - 1

    while left <= right:
      mid = (left + right) // 2
      if nums[mid] == target:
        return mid
      if nums[mid] < target:
        left = mid + 1
      else:
        right = mid - 1

    return -1

# Time complexity: O(log n)
# Space complexity: O(1)`,

  'neet-search-a-2d-matrix': `def search_a_2d_matrix(matrix: list[list[int]], target: int) -> bool:
    rows = len(matrix)
    cols = len(matrix[0])
    left = 0
    right = rows * cols - 1

    while left <= right:
      mid = (left + right) // 2
      value = matrix[mid // cols][mid % cols]

      if value == target:
        return True
      if value < target:
        left = mid + 1
      else:
        right = mid - 1

    return False

# Time complexity: O(log(m*n))
# Space complexity: O(1)`,

  'neet-koko-eating-bananas': `def koko_eating_bananas(piles: list[int], h: int) -> int:
    left = 1
    right = max(piles)
    best = right

    while left <= right:
      mid = (left + right) // 2
      hours = sum((pile + mid - 1) // mid for pile in piles)

      if hours <= h:
        best = mid
        right = mid - 1
      else:
        left = mid + 1

    return best

# Time complexity: O(n log maxPile)
# Space complexity: O(1)`,

  'neet-find-minimum-in-rotated-sorted-array': `def find_minimum_in_rotated_sorted_array(nums: list[int]) -> int:
    left = 0
    right = len(nums) - 1
    best = nums[0]

    while left <= right:
      if nums[left] <= nums[right]:
        best = min(best, nums[left])
        break

      mid = (left + right) // 2
      best = min(best, nums[mid])

      if nums[mid] >= nums[left]:
        left = mid + 1
      else:
        right = mid - 1

    return best

# Time complexity: O(log n)
# Space complexity: O(1)`,

  'neet-search-in-rotated-sorted-array': `def search_in_rotated_sorted_array(nums: list[int], target: int) -> int:
    left = 0
    right = len(nums) - 1

    while left <= right:
      mid = (left + right) // 2
      if nums[mid] == target:
        return mid

      if nums[left] <= nums[mid]:
        if nums[left] <= target < nums[mid]:
          right = mid - 1
        else:
          left = mid + 1
      else:
        if nums[mid] < target <= nums[right]:
          left = mid + 1
        else:
          right = mid - 1

    return -1

# Time complexity: O(log n)
# Space complexity: O(1)`,

  'neet-time-based-key-value-store': `from bisect import bisect_right

class TimeMap:
    def __init__(self):
      self.store = {}

    def set(self, key: str, value: str, timestamp: int) -> None:
      if key not in self.store:
        self.store[key] = []
      self.store[key].append((timestamp, value))

    def get(self, key: str, timestamp: int) -> str:
      if key not in self.store:
        return ''

      items = self.store[key]
      idx = bisect_right(items, (timestamp, chr(255))) - 1
      if idx < 0:
        return ''
      return items[idx][1]

# set: O(1) amortized, get: O(log n)`,

  'neet-median-of-two-sorted-arrays': `def median_of_two_sorted_arrays(nums1: list[int], nums2: list[int]) -> float:
    if len(nums1) > len(nums2):
      nums1, nums2 = nums2, nums1

    x, y = len(nums1), len(nums2)
    left, right = 0, x

    while left <= right:
      px = (left + right) // 2
      py = (x + y + 1) // 2 - px

      max_left_x = float('-inf') if px == 0 else nums1[px - 1]
      min_right_x = float('inf') if px == x else nums1[px]
      max_left_y = float('-inf') if py == 0 else nums2[py - 1]
      min_right_y = float('inf') if py == y else nums2[py]

      if max_left_x <= min_right_y and max_left_y <= min_right_x:
        if (x + y) % 2 == 0:
          return (max(max_left_x, max_left_y) + min(min_right_x, min_right_y)) / 2.0
        return float(max(max_left_x, max_left_y))

      if max_left_x > min_right_y:
        right = px - 1
      else:
        left = px + 1

    raise ValueError('Invalid input arrays')

# Time complexity: O(log(min(m, n)))
# Space complexity: O(1)`,

  'neet-reverse-linked-list': `def reverse_linked_list(values: list[int]) -> list[int]:
    result = values[:]
    left = 0
    right = len(result) - 1

    while left < right:
      result[left], result[right] = result[right], result[left]
      left += 1
      right -= 1

    return result

# Time complexity: O(n)
# Space complexity: O(n) for copied list`,

  'neet-merge-two-sorted-lists': `def merge_two_sorted_lists(list1: list[int], list2: list[int]) -> list[int]:
    i = 0
    j = 0
    merged = []

    while i < len(list1) and j < len(list2):
      if list1[i] <= list2[j]:
        merged.append(list1[i])
        i += 1
      else:
        merged.append(list2[j])
        j += 1

    merged.extend(list1[i:])
    merged.extend(list2[j:])
    return merged

# Time complexity: O(m + n)
# Space complexity: O(m + n)`,

  'neet-reorder-list': `def reorder_list(values: list[int]) -> list[int]:
    result = []
    left = 0
    right = len(values) - 1

    while left <= right:
      result.append(values[left])
      left += 1
      if left <= right:
        result.append(values[right])
        right -= 1

    return result

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-remove-nth-node-from-end-of-list': `def remove_nth_node_from_end_of_list(values: list[int], n: int) -> list[int]:
    result = values[:]
    remove_index = len(result) - n
    del result[remove_index]
    return result

# Time complexity: O(n)
# Space complexity: O(n) for copied list`,

  'neet-copy-list-with-random-pointer': `def copy_list_with_random_pointer(values: list[int], random: list[int | None]) -> tuple[list[int], list[int | None]]:
    copied_values = values[:]
    copied_random = [idx if idx is None else int(idx) for idx in random]
    return copied_values, copied_random

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-add-two-numbers': `def add_two_numbers(l1: list[int], l2: list[int]) -> list[int]:
    i = 0
    j = 0
    carry = 0
    result = []

    while i < len(l1) or j < len(l2) or carry:
      a = l1[i] if i < len(l1) else 0
      b = l2[j] if j < len(l2) else 0
      total = a + b + carry

      result.append(total % 10)
      carry = total // 10
      i += 1
      j += 1

    return result

# Time complexity: O(max(m, n))
# Space complexity: O(max(m, n))`,

  'neet-linked-list-cycle': `def linked_list_cycle(values: list[int], pos: int) -> bool:
    return 0 <= pos < len(values)

# In this list+pos representation, any valid pos means a cycle exists.`,

  'neet-find-the-duplicate-number': `def find_the_duplicate_number(nums: list[int]) -> int:
    slow = nums[0]
    fast = nums[0]

    while True:
      slow = nums[slow]
      fast = nums[nums[fast]]
      if slow == fast:
        break

    slow = nums[0]
    while slow != fast:
      slow = nums[slow]
      fast = nums[fast]

    return slow

# Time complexity: O(n)
# Space complexity: O(1)`,

  'neet-lru-cache': `from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity: int):
      self.capacity = capacity
      self.cache = OrderedDict()

    def get(self, key: int) -> int:
      if key not in self.cache:
        return -1
      self.cache.move_to_end(key)
      return self.cache[key]

    def put(self, key: int, value: int) -> None:
      if key in self.cache:
        self.cache.move_to_end(key)
      self.cache[key] = value
      if len(self.cache) > self.capacity:
        self.cache.popitem(last=False)

# get/put are O(1) average`,

  'neet-invert-binary-tree': `from collections import deque

class Node:
    def __init__(self, val: int):
      self.val = val
      self.left: Node | None = None
      self.right: Node | None = None


def invert_binary_tree(root: list[int | None]) -> list[int | None]:
    if not root or root[0] is None:
      return []

    nodes = [None if value is None else Node(value) for value in root]
    for i, node in enumerate(nodes):
      if node is None:
        continue
      left = 2 * i + 1
      right = 2 * i + 2
      if left < len(nodes):
        node.left = nodes[left]
      if right < len(nodes):
        node.right = nodes[right]

    def invert(node: Node | None) -> None:
      if node is None:
        return
      node.left, node.right = node.right, node.left
      invert(node.left)
      invert(node.right)

    invert(nodes[0])

    out = []
    queue = deque([nodes[0]])
    while queue:
      node = queue.popleft()
      if node is None:
        out.append(None)
        continue
      out.append(node.val)
      queue.append(node.left)
      queue.append(node.right)

    while out and out[-1] is None:
      out.pop()

    return out

# Time complexity: O(n)
# Space complexity: O(n)`,

  'neet-maximum-depth-of-binary-tree': `def maximum_depth_of_binary_tree(root: list[int | None]) -> int:
    def depth(index: int) -> int:
      if index >= len(root) or root[index] is None:
        return 0
      return 1 + max(depth(2 * index + 1), depth(2 * index + 2))

    return depth(0)

# Time complexity: O(n)
# Space complexity: O(h) recursion`,

  'neet-diameter-of-binary-tree': `def diameter_of_binary_tree(root: list[int | None]) -> int:
    best = 0

    def height(index: int) -> int:
      nonlocal best
      if index >= len(root) or root[index] is None:
        return 0

      left = height(2 * index + 1)
      right = height(2 * index + 2)
      best = max(best, left + right)
      return 1 + max(left, right)

    height(0)
    return best

# Time complexity: O(n)
# Space complexity: O(h) recursion`,

  'neet-balanced-binary-tree': `def balanced_binary_tree(root: list[int | None]) -> bool:
    def check(index: int) -> int:
      if index >= len(root) or root[index] is None:
        return 0

      left = check(2 * index + 1)
      if left == -1:
        return -1

      right = check(2 * index + 2)
      if right == -1:
        return -1

      if abs(left - right) > 1:
        return -1

      return 1 + max(left, right)

    return check(0) != -1

# Time complexity: O(n)
# Space complexity: O(h) recursion`,

  'neet-same-tree': `def same_tree(p: list[int | None], q: list[int | None]) -> bool:
    def same(i: int, j: int) -> bool:
      p_none = i >= len(p) or p[i] is None
      q_none = j >= len(q) or q[j] is None

      if p_none and q_none:
        return True
      if p_none or q_none:
        return False
      if p[i] != q[j]:
        return False

      return same(2 * i + 1, 2 * j + 1) and same(2 * i + 2, 2 * j + 2)

    return same(0, 0)

# Time complexity: O(n)
# Space complexity: O(h) recursion`,

  'neet-subtree-of-another-tree': `def subtree_of_another_tree(root: list[int | None], sub_root: list[int | None]) -> bool:
    def serialize(tree: list[int | None], index: int, out: list[str]) -> None:
      if index >= len(tree) or tree[index] is None:
        out.append('#')
        return
      out.append(str(tree[index]))
      serialize(tree, 2 * index + 1, out)
      serialize(tree, 2 * index + 2, out)

    root_ser: list[str] = []
    sub_ser: list[str] = []
    serialize(root, 0, root_ser)
    serialize(sub_root, 0, sub_ser)

    return ','.join(sub_ser) in ','.join(root_ser)

# Time complexity: O(n + m)
# Space complexity: O(n + m)`,

  'neet-lowest-common-ancestor-of-bst': `def lowest_common_ancestor_of_bst(root: list[int | None], p: int, q: int) -> int:
    index = 0

    while index < len(root) and root[index] is not None:
      value = root[index]
      if p < value and q < value:
        index = 2 * index + 1
      elif p > value and q > value:
        index = 2 * index + 2
      else:
        return value

    raise ValueError('p and q must exist in the BST')

# Time complexity: O(h)
# Space complexity: O(1)`,
};

type DraftQuality = {
  state: 'early' | 'mixed' | 'strong';
  strengths: string[];
  gaps: string[];
};

// =============================================================================
// LLM API Client
// =============================================================================

/**
 * Error class for LLM API errors
 */
export class LLMApiError extends Error {
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;

  constructor(message: string, statusCode?: number, isRetryable: boolean = false) {
    super(message);
    this.name = 'LLMApiError';
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

/**
 * Call the OpenAI API with the given prompts
 * 
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param apiKey - The API key to use
 * @param signal - Optional AbortSignal for cancellation
 * @returns The LLM response content
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(OPENAI_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    
    // Determine if error is retryable
    const isRetryable = response.status === 429 || // Rate limit
                        response.status === 500 || // Server error
                        response.status === 502 || // Bad gateway
                        response.status === 503 || // Service unavailable
                        response.status === 504;   // Gateway timeout

    throw new LLMApiError(
      `OpenAI API error: ${response.status} - ${errorBody}`,
      response.status,
      isRetryable
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new LLMApiError('Empty response from OpenAI API');
  }

  return content;
}

/**
 * Call the LLM API with retry logic
 * 
 * @param systemPrompt - The system prompt
 * @param userPrompt - The user prompt
 * @param apiKey - The API key to use
 * @param signal - Optional AbortSignal for cancellation
 * @returns The LLM response content
 */
async function callLLMWithRetry(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Create a timeout controller
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

      // Set up abort handling for external signal
      const handleExternalAbort = () => timeoutController.abort();
      if (signal) {
        signal.addEventListener('abort', handleExternalAbort);
      }

      try {
        const result = await callOpenAI(systemPrompt, userPrompt, apiKey, timeoutController.signal);
        clearTimeout(timeoutId);
        return result;
      } finally {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', handleExternalAbort);
        }
      }
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted by user
      if (signal?.aborted) {
        throw error;
      }

      // Check if error is retryable
      if (error instanceof LLMApiError && !error.isRetryable) {
        throw error;
      }

      // Wait before retrying (except on last attempt)
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1)); // Exponential backoff
      }
    }
  }

  throw lastError || new LLMApiError('Failed after max retries');
}

// =============================================================================
// ProctorService Implementation
// =============================================================================

/**
 * ProctorService implementation with LLM integration and mock fallback
 * 
 * When an API key is configured, uses real LLM calls.
 * When no API key is available, falls back to mock responses.
 */
export class ProctorService implements IProctorService {
  private abortController: AbortController | null = null;
  private lastInteractionMode: ProctorInteractionMode = 'idle';

  /**
   * Check if LLM mode is available (API key is configured)
   */
  private isLLMAvailable(): boolean {
    if (!hasApiKey()) return false;
    const key = getConfiguredApiKey();
    if (!key) return false;
    // Keep deterministic mode for local test keys used in automated UI tests.
    if (key.startsWith('test-')) return false;
    return true;
  }

  /**
   * Cancel any pending LLM request
   */
  cancelPendingRequest(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  getLastInteractionMode(): ProctorInteractionMode {
    return this.lastInteractionMode;
  }

  getProactiveNudge(context: SessionContext): string | null {
    const responseMode = context.problem.contract?.responseMode
      ?? ((context.problem.assessmentType ?? 'coding') === 'coding' ? 'code' : 'narrative');
    const elapsed = Math.max(0, context.problem.timeLimit * 60 - context.timeRemaining);
    if (elapsed < 45) return null;

    if (responseMode === 'code') {
      const current = context.currentCode.trim();
      const scaffold = (context.problem.contract?.starterTemplate || context.problem.scaffold || '').trim();
      const normalizedCurrent = current.replace(/\s+/g, '');
      const normalizedScaffold = scaffold.replace(/\s+/g, '');
      const noProgress = normalizedCurrent.length <= normalizedScaffold.length + 30 || /\bpass\b/.test(current);
      if (noProgress) {
        return (
          context.problem.tutorPlan?.nudgeRules.find((rule) => rule.when === 'no-progress')?.message
          ?? 'Quick checkpoint: you are still near scaffold-only. Outline your approach in 2-3 bullets before coding.'
        );
      }

      const nestedLoops = /for[\s\S]{0,180}for/.test(current) || /while[\s\S]{0,180}while/.test(current);
      const target = context.problem.tutorPlan?.complexityTarget;
      const likelyTooExpensive =
        nestedLoops && (target === 'O(n)' || target === 'O(log n)' || target === 'O(1)');
      if (likelyTooExpensive) {
        return (
          context.problem.tutorPlan?.nudgeRules.find((rule) => rule.when === 'likely-inefficient')?.message
          ?? 'This may be more expensive than needed. Re-check the target complexity and data structure choice.'
        );
      }
      return null;
    }

    if (context.currentCode.trim().length < 80) {
      return (
        context.problem.tutorPlan?.nudgeRules.find((rule) => rule.when === 'missing-structure')?.message
        ?? 'Add structure: context, approach, rationale, and concise conclusion.'
      );
    }
    return null;
  }

  private respondDeterministically(question: string, context: SessionContext): string | null {
    const q = question.toLowerCase().trim();
    const assessmentType = context.problem.assessmentType ?? 'coding';
    const asksCoreClarification =
      /(don't understand|dont understand|i don't get|i dont get|what are you asking|is this a flawed question|always yes|always true|reverse.*string)/.test(q);
    const asksHint = /(hint|help|stuck|confus|how do i start)\b/.test(q);
    const asksClarification = /(what does|what is|what's|whats|input|parameter|argument|variable|format|meaning)/.test(q);
    const asksSelfCheck = /(hows that|how's that|how is that|is this good|is this right|is this correct|does this work|review this|what do you think)/.test(q);
    const asksVisibleCodeReview =
      /(look at it|look at my code|look at the code|can't you see|cant you see|that'?s literally what i did|did you look|check the code|can you see it)/.test(q);
    const asksComplexity = /(complexity|big o|runtime|space)/.test(q);
    const asksDataStructure =
      /(data structure|hash ?map|dictionary|dict|set|array|stack|queue)/.test(q) &&
      /(what|which|should|use|pick)/.test(q);
    const asksTime = /how much time|time left|remaining/.test(q);

    if (asksTime) {
      const minutes = Math.floor(context.timeRemaining / 60);
      const seconds = context.timeRemaining % 60;
      return `You have ${minutes}:${seconds.toString().padStart(2, '0')} remaining.`;
    }

    if (assessmentType === 'coding' && asksCoreClarification) {
      return this.applyNoRepeatGuard(this.buildPlainLanguageProblemClarification(context.problem), context);
    }

    if (asksClarification) {
      const faq = context.problem.tutorPlan?.clarifications.find((entry) =>
        entry.triggers.some((trigger) => q.includes(trigger))
      );
      if (faq) {
        return this.applyNoRepeatGuard(faq.response, context);
      }
      const codingClarification = this.getCodingClarificationResponse(q, context.problem);
      if (codingClarification) {
        return this.applyNoRepeatGuard(codingClarification, context);
      }
      const domainClarification = this.getDomainClarificationResponse(q, context.problem);
      if (domainClarification) {
        return this.applyNoRepeatGuard(domainClarification, context);
      }

      const inputClarification = this.getInputClarificationResponse(q, context.problem);
      if (inputClarification) return this.applyNoRepeatGuard(inputClarification, context);
    }

    if (asksComplexity) {
      const target = context.problem.tutorPlan?.complexityTarget;
      if (target) {
        return this.applyNoRepeatGuard(`Aim for ${target}. Explain why your chosen data structure reaches that complexity.`, context);
      }
      return this.applyNoRepeatGuard('State time and space complexity explicitly, then justify them from your loops/data structures.', context);
    }

    if (asksDataStructure) {
      return this.applyNoRepeatGuard(this.getDataStructureGuidance(context.problem), context);
    }

    if (asksHint) {
      const codingClarification = this.getCodingClarificationResponse(q, context.problem);
      if (codingClarification) {
        return this.applyNoRepeatGuard(codingClarification, context);
      }

      const responseMode = context.problem.contract?.responseMode
        ?? (assessmentType === 'coding' ? 'code' : 'narrative');
      if (responseMode === 'narrative') {
        return this.applyNoRepeatGuard(this.getNarrativeHint(context), context);
      }

      const priorHintCount = context.chatHistory.filter(
        (msg) => msg.role === 'proctor' && msg.content.startsWith('Hint')
      ).length;
      const hintLadder = context.problem.tutorPlan?.hintLadder ?? [];
      const step = hintLadder[Math.min(priorHintCount, Math.max(0, hintLadder.length - 1))];
      if (step) {
        return this.applyNoRepeatGuard(`Hint ${step.level}: ${step.hint}`, context);
      }
      return this.applyNoRepeatGuard('Start by restating the contract, then choose one approach and test it against an edge case.', context);
    }

    if (assessmentType === 'coding' && asksVisibleCodeReview && context.currentCode.trim().length > 30) {
      return this.applyNoRepeatGuard(this.buildConcreteCodeFeedback(context.problem, context.currentCode), context);
    }

    if (asksSelfCheck) {
      if (assessmentType !== 'coding' && this.extractNarrativeDraft(context.problem, context.currentCode).length > 20) {
        return this.applyNoRepeatGuard(this.buildNonCodingDraftFeedback(context.problem, context.currentCode), context);
      }

      if (assessmentType === 'coding' && context.currentCode.trim().length > 30) {
        return this.applyNoRepeatGuard(this.buildConcreteCodeFeedback(context.problem, context.currentCode), context);
      }

      const quality = this.analyzeDraftQuality(context.problem, context.currentCode);
      if (quality.state === 'early') {
        return this.applyNoRepeatGuard(`Good start: ${quality.strengths[0]}. Before submitting, revisit: ${quality.gaps.join(' ')}`, context);
      }
      if (quality.state === 'mixed') {
        return this.applyNoRepeatGuard(`You have solid parts (${quality.strengths.join('; ')}), but reconsider: ${quality.gaps.join(' ')}`, context);
      }
      return this.applyNoRepeatGuard(`This looks strong overall (${quality.strengths.join('; ')}). Quick final check: ${quality.gaps[0] ?? 'run through one tricky edge case and verify complexity.'}`, context);
    }

    if (assessmentType === 'coding') {
      const coachingReply = this.getCodingFollowUpReply(q, context);
      if (coachingReply) return this.applyNoRepeatGuard(coachingReply, context);
      return this.applyNoRepeatGuard('Give me your current plan in one sentence, then we will pressure-test it with one edge case.', context);
    }

    const defaultNarrativeReply =
      'Use any clear format (paragraph is fine). Tell me your decision, why you chose it, and the outcome.';
    return this.applyNoRepeatGuard(defaultNarrativeReply, context);
  }

  private enforceCriticalCoaching(question: string, context: SessionContext, llmResponse: string): string {
    const q = question.toLowerCase().trim();
    const assessmentType = context.problem.assessmentType ?? 'coding';
    const isCoding = assessmentType === 'coding';
    const draftText = this.extractNarrativeDraft(context.problem, context.currentCode);
    const asksCoreClarification =
      /(don't understand|dont understand|i don't get|i dont get|what are you asking|is this a flawed question|always yes|always true|reverse.*string)/.test(q);
    const asksSelfCheck = /(hows that|how's that|how is that|is this good|is this right|is this correct|does this work|review)/.test(q);
    const asksVisibleCodeReview =
      /(look at it|look at my code|look at the code|can't you see|cant you see|that'?s literally what i did|did you look|check the code|can you see it)/.test(q);
    const asksTermDefinition = /(what is|what's|define|meaning of)\b/.test(q);

    if (isCoding && asksCoreClarification) {
      return this.buildPlainLanguageProblemClarification(context.problem);
    }

    if (isCoding) {
      const codingClarification = this.getCodingClarificationResponse(q, context.problem);
      if (codingClarification && (asksTermDefinition || /1-index|pointer|sorted|null|placeholder|python/.test(q))) {
        return codingClarification;
      }
    }

    if (isCoding && asksSelfCheck && context.currentCode.trim().length > 30) {
      return this.buildConcreteCodeFeedback(context.problem, context.currentCode);
    }

    if (isCoding && asksVisibleCodeReview && context.currentCode.trim().length > 30) {
      return this.buildConcreteCodeFeedback(context.problem, context.currentCode);
    }

    if (isCoding && context.currentCode.trim().length > 30 && this.responseAsksCandidateToReshareCode(llmResponse)) {
      return this.buildConcreteCodeFeedback(context.problem, context.currentCode);
    }

    if (!isCoding && asksSelfCheck && draftText.length > 20) {
      return this.buildNonCodingDraftFeedback(context.problem, context.currentCode);
    }

    const llmSoundsLikeCodingLeak =
      !isCoding &&
      /(coding problem|algorithm|data structure|function signature|python list|big o|loop structure|return those indices|numbers\[[^\]]+\]|two-pointer)/i.test(llmResponse);
    if (llmSoundsLikeCodingLeak && draftText.length > 20) {
      return this.buildNonCodingDraftFeedback(context.problem, context.currentCode);
    }

    const looksLikeLoopPrompt =
      /(how do you plan|can you outline|do you have .*data structure in mind|what assumptions and formulas will you use first)/i
        .test(llmResponse);

    if (looksLikeLoopPrompt && asksTermDefinition) {
      const domainClarification = this.getDomainClarificationResponse(q, context.problem);
      if (domainClarification) return domainClarification;
    }

    return llmResponse;
  }

  private buildPlainLanguageProblemClarification(problem: Problem): string {
    const text = `${problem.title} ${problem.prompt}`.toLowerCase();
    if (this.isTwoSumSortedProblem(problem)) {
      return 'Question in plain language: use the sorted list to find the two values that add up to the target, then return their positions as 1-based indices. In Python, still read the list with normal 0-based indexing; only the returned positions are 1-based.';
    }

    if (/(palindrome.*rearrang|rearranged to form a palindrome|palindrome rearranging)/.test(text)) {
      return 'You are not being asked whether any string can be reversed (that is always true). You are asked whether the letters can be reordered so the result reads the same forward and backward. Rule: at most one character may have an odd count. Example: "aabb" => True, "abc" => False.';
    }

    const signature = problem.contract?.functionSignature
      ?? problem.scaffold
        .split('\n')
        .find((line) => line.trim().startsWith('def ') || line.trim().startsWith('class '));
    if (signature) {
      return `Question in plain language: implement the exact contract \`${signature.trim()}\` and return the required result for the given input.`;
    }

    return 'Question in plain language: compute the required output from the given input according to the prompt constraints and examples.';
  }

  private buildConcreteCodeFeedback(problem: Problem, currentCode: string): string {
    const code = currentCode.trim();
    const issues: string[] = [];

    if (this.isTwoSumSortedProblem(problem)) {
      if (/left\s*=\s*1\b/.test(code) || /right\s*=\s*len\(\s*numbers\s*\)/.test(code)) {
        issues.push('Keep Python list access 0-based. The simplest setup is `left = 0` and `right = len(numbers) - 1`; only the returned answer should be 1-indexed.');
      }
      if (/numbers\s*\[\s*left\s*\]/.test(code) && /left\s*=\s*1\b/.test(code)) {
        issues.push('If `left` starts at 1, then `numbers[left]` skips the first value. Either subtract 1 on access everywhere, or simpler: keep `left` and `right` 0-based and return `[left + 1, right + 1]`.');
      }
      if (/\bfor\b/.test(code) && !/\bwhile\b/.test(code)) {
        issues.push('You only need one `while left < right` loop here; the sorted order lets you move one side at a time.');
      }
    }

    if (problem.language === 'python') {
      if (/\breturn\s+false\b/.test(code)) {
        issues.push('Python boolean literal is `False`, not `false`.');
      }
      if (/\breturn\s+true\b/.test(code)) {
        issues.push('Python boolean literal is `True`, not `true`.');
      }
    }

    const likelyCounterOddBug =
      /counter\s*\(/i.test(code) &&
      /for\s+\w+\s*,\s*\w+\s+in\s+enumerate\s*\(\s*s\s*\)/.test(code) &&
      /cnt\[\s*\w+\s*\]\s*%\s*2/.test(code);
    if (likelyCounterOddBug) {
      issues.push('You are iterating over every character in `s`, so odd counts are double-counted for repeated letters. Iterate over `cnt.values()` once per unique character.');
    }

    if (/\bpass\b/.test(code)) {
      issues.push('Remove remaining `pass` placeholders once logic is complete.');
    }

    if (issues.length === 0) {
      if (this.isTwoSumSortedProblem(problem) && code.length > 30) {
        return 'I can see the draft. For this problem, keep the Python list access 0-based, move `left` rightward when the sum is too small, move `right` leftward when the sum is too large, and only convert to 1-based in the returned answer.';
      }

      const quality = this.analyzeDraftQuality(problem, currentCode);
      if (quality.state === 'strong') {
        return `This is close. Final check: ${quality.gaps[0] ?? 'run one edge case and confirm complexity.'}`;
      }
      return `Good progress. Next fix: ${quality.gaps.join(' ')}`;
    }

    return `Good progress. Fix these before submitting: ${issues.join(' ')} Quick test after fixes: s="aabb" -> True, s="abcad" -> False.`;
  }

  private extractNarrativeDraft(problem: Problem, currentCode: string): string {
    const text = (currentCode ?? '').trim();
    if (!text) return '';

    const scaffold = (problem.contract?.starterTemplate || problem.scaffold || '').trim();
    if (text === scaffold) return '';

    const templateLine = /^(#|\/\/)\s*(write your (response|answer) (here|below)|any clear format is acceptable.*|include .*|situation:|task:|action:|actions:|result:|reflection:|assumptions:|formula:|formulas:|base case:|sensitivity.*|interpretation:|recommendation:)\s*$/i;

    const cleaned = text
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => !templateLine.test(line.trim()))
      .join('\n')
      .trim();

    return cleaned === scaffold ? '' : cleaned;
  }

  private buildNonCodingDraftFeedback(problem: Problem, currentCode: string): string {
    const assessmentType = problem.assessmentType ?? 'behavioral';
    const draft = this.extractNarrativeDraft(problem, currentCode);
    const lower = draft.toLowerCase();

    if (draft.length < 30) {
      if (assessmentType === 'math') {
        return 'I can review the draft directly, but right now it still needs the core structure: assumptions, formula, calculation, and one takeaway.';
      }
      if (assessmentType === 'system-design') {
        return 'I can review the draft directly, but right now it still needs the core structure: requirements, proposed architecture, key tradeoff, and one reliability note.';
      }
      return 'I can review the draft directly, but right now it still needs the core story: one real situation, what you decided, what happened, and what you learned.';
    }

    if (assessmentType === 'math') {
      const hasAssumptions = /\b(assumption|assume|given)\b/.test(lower);
      const hasFormula = /[=/*+\-]|\bformula\b/.test(lower);
      const hasNumbers = /\d/.test(lower);
      const hasTakeaway = /\b(therefore|so|recommend|bottom line|this implies)\b/.test(lower);
      const strengths: string[] = [];
      const gaps: string[] = [];

      if (hasAssumptions) strengths.push('you are naming assumptions instead of hiding them');
      if (hasFormula || hasNumbers) strengths.push('you started turning the prompt into an actual model');
      if (!hasAssumptions) gaps.push('state the assumption set first');
      if (!hasFormula) gaps.push('write the exact formula before calculating');
      if (!hasNumbers) gaps.push('show at least one computed base case');
      if (!hasTakeaway) gaps.push('end with the business implication in one sentence');

      return `This is a good start. What is working: ${strengths.slice(0, 2).join('; ') || 'you have begun a real quantitative draft'}. To make it stronger, ${gaps.slice(0, 3).join('; ')}.`;
    }

    if (assessmentType === 'system-design') {
      const hasRequirements = /\b(requirement|latency|throughput|scale|availability|users)\b/.test(lower);
      const hasArchitecture = /\b(api|service|database|cache|queue|worker|load balancer)\b/.test(lower);
      const hasTradeoff = /\b(tradeoff|risk|cost|consistency|latency|complexity)\b/.test(lower);
      const hasReliability = /\b(retry|fallback|monitor|alert|failure|idempot|backup)\b/.test(lower);
      const strengths: string[] = [];
      const gaps: string[] = [];

      if (hasRequirements) strengths.push('you are grounding the design in requirements');
      if (hasArchitecture) strengths.push('you already named concrete components');
      if (!hasRequirements) gaps.push('start with scale and product requirements before components');
      if (!hasArchitecture) gaps.push('name the core components and data flow explicitly');
      if (!hasTradeoff) gaps.push('call out one real tradeoff and why you chose this direction');
      if (!hasReliability) gaps.push('add one failure-handling or reliability safeguard');

      return `This is a solid start. What is working: ${strengths.slice(0, 2).join('; ') || 'you have started shaping a concrete design'}. To make it interview-ready, ${gaps.slice(0, 3).join('; ')}.`;
    }

    const hasContext = /\b(when|during|project|feature|incident|customer|team|launch|context|recent)\b/.test(lower);
    const hasDecision = /\b(decided|chose|proposed|prioritized|recommended|defined|set|picked|aligned)\b/.test(lower);
    const hasOutcome = /\b(result|impact|improved|reduced|increased|outcome|saved|grew|moved|shipped)\b/.test(lower);
    const hasMetric = /\d/.test(lower) || /\b(signups?|clicks?|conversion|retention|adoption|engagement|latency|errors?|revenue|usage)\b/.test(lower);
    const hasReflection = /\b(learned|next time|would do differently|in hindsight|reflection)\b/.test(lower);
    const strengths: string[] = [];
    const gaps: string[] = [];

    if (/posthog|metric|signup|engagement|conversion|retention/.test(lower)) {
      strengths.push('you picked a believable example and named what you measured');
    }
    if (hasDecision) {
      strengths.push('you are starting to describe your judgment, not just tasks');
    }
    if (hasContext) {
      strengths.push('there is enough context to turn this into a real interview story');
    }

    if (!hasContext) gaps.push('name the specific project or decision point up front');
    if (!hasDecision) gaps.push('say what you specifically decided or pushed for before building');
    if (!hasOutcome) gaps.push('say what happened afterward, not just what you hoped to measure');
    if (!hasMetric) gaps.push('add one concrete metric or signal so the impact feels real');
    if (!hasReflection) gaps.push('close with what you learned or would refine next time');

    if (gaps.length === 0) {
      return `This is close. What is working: ${strengths.slice(0, 2).join('; ') || 'the story is concrete and credible'}. Final polish: tighten it to the key beats and end with one crisp lesson.`;
    }

    return `This is a good start. What is working: ${strengths.slice(0, 2).join('; ') || 'you already have a real draft to work from'}. To make it interview-ready, ${gaps.slice(0, 3).join('; ')}.`;
  }

  private applyNoRepeatGuard(response: string, context: SessionContext): string {
    const normalized = response.trim().toLowerCase();
    if (!normalized) return response;

    const proctorMessages = context.chatHistory
      .filter((msg) => msg.role === 'proctor')
      .map((msg) => msg.content.trim().toLowerCase());
    const recent = proctorMessages.slice(-3);
    const repeated = recent.some((content) => content === normalized);
    if (!repeated) return response;

    const assessmentType = context.problem.assessmentType ?? 'coding';
    if (assessmentType === 'coding') {
      if ((context.currentCode ?? '').trim().length < 60) {
        return 'Quick reset: restate the exact input/output contract, then pick one data structure and explain why.';
      }
      return 'Quick reset: test your current draft on one edge case and tell me expected output before changing code.';
    }

    return 'Quick reset: paragraph format is fine. Give one concrete decision you made, why, and the measurable outcome.';
  }

  private getNarrativeHint(context: SessionContext): string {
    const text = this.extractNarrativeDraft(context.problem, context.currentCode ?? '');
    if (text.length < 40) {
      return 'Start with one concrete situation, then your decision, then the result. STAR is optional; a clear paragraph is fine.';
    }

    const lower = text.toLowerCase();
    const hasDecision = /\b(decided|chose|proposed|recommended|prioritized|i chose)\b/.test(lower);
    const hasOutcome = /\b(result|impact|improved|reduced|increased|outcome|saved)\b/.test(lower);
    const hasMetric = /\d/.test(lower);

    if (!hasDecision) {
      return 'Add the decision point explicitly: what options existed, and what did you choose?';
    }
    if (!hasOutcome) {
      return 'Add the outcome explicitly: what changed after your action?';
    }
    if (!hasMetric) {
      return 'Your content is good. Add one metric or concrete signal (time, % change, incidents, revenue, etc.).';
    }

    return 'Good draft. Tighten to 4-6 concise sentences and end with what you learned.';
  }

  private getCodingFollowUpReply(questionLower: string, context: SessionContext): string | null {
    const codingClarification = this.getCodingClarificationResponse(questionLower, context.problem);
    if (codingClarification) {
      return codingClarification;
    }

    if (/(oh no|this is bad|badv|confused|lost)/.test(questionLower)) {
      return `You're okay. Start with this: ${this.getDataStructureGuidance(context.problem)} Then test on the first example.`;
    }

    const mentionsBruteForce = /brute|for each|nested loop|check each|remove.*from/.test(questionLower);
    const mentionsComplexityTarget = /\bo\(/.test(questionLower) || /\bo\(n\)|linear/.test(questionLower);
    const sharesApproach =
      /(i think|i'm thinking|my approach|i would|i can|i'll|we could|first i|then i)/.test(questionLower) ||
      mentionsBruteForce;

    if (mentionsBruteForce) {
      const target = context.problem.tutorPlan?.complexityTarget;
      if (target === 'O(n)') {
        return `Good baseline. That brute-force path is usually O(n^2). To reach O(n), use ${this.getDataStructureGuidance(context.problem).toLowerCase()}`;
      }
      return `Good baseline. Before coding, compare that against a more direct structure-driven approach: ${this.getDataStructureGuidance(context.problem)}`;
    }

    if (sharesApproach) {
      if (mentionsComplexityTarget || context.problem.tutorPlan?.complexityTarget) {
        return `Good direction. Next step: choose the exact data structure and explain in one sentence why it matches the target complexity.`;
      }
      return `Good start. Now pick one concrete data structure, then walk through the first example with it before coding.`;
    }

    return null;
  }

  private getDataStructureGuidance(problem: Problem): string {
    const text = `${problem.title} ${problem.prompt} ${problem.expectedApproach ?? ''}`.toLowerCase();

    if (this.isTwoSumSortedProblem(problem)) {
      return 'Use two pointers: start `left` at the beginning and `right` at the end. Because the array is sorted, moving `left` increases the sum and moving `right` decreases it.';
    }
    if (/(anagram|frequency|character counts?|rearrang|permutation)/.test(text)) {
      return 'Use a frequency map (or fixed 26-length count array for lowercase letters).';
    }
    if (/(duplicate|seen|contains duplicate|first duplicate)/.test(text)) {
      return 'Use a set for O(1) membership checks while scanning once.';
    }
    if (/(two sum|complement|target)/.test(text)) {
      return 'Use a hash map from value to index so each lookup is O(1).';
    }
    if (/(parentheses|bracket|stack|reverse polish|daily temperatures|histogram)/.test(text)) {
      return 'Use a stack to track pending elements in order.';
    }
    if (/(substring|window|longest|minimum window|character replacement)/.test(text)) {
      return 'Use a sliding window with a map/set for character counts.';
    }
    if (/(sorted|two pointers|container|palindrome)/.test(text)) {
      return 'Use two pointers to scan from both sides efficiently.';
    }
    if (/(binary search|rotated|koko|minimum in rotated)/.test(text)) {
      return 'Use binary search to cut the search space each step.';
    }
    if (/(graph|road|path|dijkstra|network)/.test(text)) {
      return 'Use an adjacency list and a min-heap for shortest-path style traversal.';
    }
    if (/(tree|binary tree|bst|dfs|bfs)/.test(text)) {
      return 'Use DFS/BFS traversal with recursion or an explicit stack/queue.';
    }

    return 'Use the structure that gives O(1) lookup for repeated checks (usually a hash map or set).';
  }

  private isTwoSumSortedProblem(problem: Problem): boolean {
    const text = `${problem.id} ${problem.title} ${problem.prompt}`.toLowerCase();
    return (
      /(two sum ii|two_sum_ii|two sum 2)/.test(text) ||
      (text.includes('sorted') && text.includes('target') && text.includes('1-index'))
    );
  }

  private getCodingClarificationResponse(questionLower: string, problem: Problem): string | null {
    const responseMode = problem.contract?.responseMode
      ?? ((problem.assessmentType ?? 'coding') === 'coding' ? 'code' : 'narrative');

    if (responseMode !== 'code') {
      return null;
    }

    const asksAboutOneIndexed = /1-index|1 indexed/.test(questionLower);
    const asksAboutPointers =
      /two pointer|two-pointer|pointer technique|pointers in python|there arent pointers|there aren't pointers/.test(questionLower);
    const asksWhySortedHelps =
      /why.*sorted|sorted.*why|why is that good when things are sorted/.test(questionLower);
    const asksAboutPlaceholderArray = /append.*null|append.*placeholder|prepend.*null|front of.*array/.test(questionLower);

    if (this.isTwoSumSortedProblem(problem)) {
      if (asksAboutOneIndexed) {
        return 'Here, "1-indexed" only changes the positions you return. Keep the Python list normal: read `numbers[0]`, `numbers[1]`, and so on. The clean approach is to work with `left = 0` and `right = len(numbers) - 1`, then return `[left + 1, right + 1]` when you find the pair.';
      }

      if (asksAboutPlaceholderArray) {
        return 'No need to insert a dummy value. That just makes the code harder to reason about. Keep the list normal, use 0-based Python access while solving, and convert to 1-based only in the final returned indices.';
      }

      if (asksAboutPointers || asksWhySortedHelps) {
        return 'In Python, "two pointers" just means two integer indices, usually `left` and `right`. This works well on a sorted array because if the current sum is too small, moving `left` rightward is the only move that can increase it; if the sum is too large, moving `right` leftward decreases it. That gives you one clean `while left < right` pass instead of checking every pair.';
      }
    }

    if (asksAboutOneIndexed && problem.prompt.toLowerCase().includes('1-indexed')) {
      return 'If the prompt says the answer is 1-indexed, that usually affects the returned positions, not how Python list access works. Read the list normally, then add 1 to the indices you return unless the prompt explicitly says the data structure itself is offset.';
    }

    if (asksAboutPointers) {
      return 'In Python, "pointers" here usually just means integer indices or references like `left` and `right`, not C-style memory pointers.';
    }

    return null;
  }

  private responseAsksCandidateToReshareCode(response: string): boolean {
    const normalized = response.toLowerCase();
    return /(show me|can you show|share your|paste|updated loop|updated code|what does your code look like|let'?s see the code)/.test(normalized);
  }

  private getDomainClarificationResponse(questionLower: string, problem: Problem): string | null {
    const domain = (problem.domain ?? '').toLowerCase();
    const title = problem.title.toLowerCase();
    const prompt = problem.prompt.toLowerCase();
    const combined = `${domain} ${title} ${prompt}`;

    if (questionLower.includes('what is arpu') || questionLower.includes('what\'s arpu') || /\barpu\b/.test(questionLower)) {
      return 'ARPU means Average Revenue Per User (or account), usually per month. Formula: ARPU = recurring revenue / active paying users.';
    }
    if (questionLower.includes('what is cac') || /\bcac\b/.test(questionLower)) {
      return 'CAC means Customer Acquisition Cost. Formula: CAC = total acquisition spend / new paying customers acquired in that period.';
    }
    if (questionLower.includes('what is cltv') || questionLower.includes('what is ltv') || /\bcltv\b|\bltv\b/.test(questionLower)) {
      return 'CLTV/LTV is Customer Lifetime Value. Common SaaS shortcut: LTV ≈ (ARPU × gross margin) / monthly churn.';
    }
    if (questionLower.includes('what is mrr') || /\bmrr\b/.test(questionLower)) {
      return 'MRR means Monthly Recurring Revenue: sum of recurring subscription revenue from active paying accounts in a month.';
    }
    if (questionLower.includes('what is churn') || /\bchurn\b/.test(questionLower)) {
      return 'Churn is the % of customers (or revenue) lost in a period. Example: monthly churn = customers lost this month / customers at month start.';
    }
    if (questionLower.includes('what is tam') || /\btam\b/.test(questionLower)) {
      return 'TAM means Total Addressable Market: total annual revenue opportunity if every ideal customer bought the product.';
    }
    if (questionLower.includes('what is sam') || /\bsam\b/.test(questionLower)) {
      return 'SAM means Serviceable Available Market: the reachable subset of TAM for your product and channels today.';
    }
    if (questionLower.includes('what is som') || /\bsom\b/.test(questionLower)) {
      return 'SOM means Serviceable Obtainable Market: realistic near-term share of SAM you can actually capture.';
    }

    if (combined.includes('behavioral') && questionLower.includes('star')) {
      return 'STAR is Situation, Task, Action, Result. It is optional here; a clear paragraph answer is also valid.';
    }

    return null;
  }

  private analyzeDraftQuality(problem: Problem, currentCode: string): DraftQuality {
    const responseMode = problem.contract?.responseMode
      ?? ((problem.assessmentType ?? 'coding') === 'coding' ? 'code' : 'narrative');

    if (responseMode === 'narrative') {
      const text = this.extractNarrativeDraft(problem, currentCode);
      const lower = text.toLowerCase();

      if (text.length < 60) {
        return {
          state: 'early',
          strengths: ['you started drafting a response'],
          gaps: ['add one concrete situation, your decision, and the outcome.'],
        };
      }

      const hasSituation = /\b(when|at|during|project|incident|situation|context)\b/.test(lower);
      const hasAction = /\b(i decided|i chose|i proposed|i implemented|i led|i changed|action)\b/.test(lower);
      const hasOutcome = /\b(result|impact|improved|reduced|increased|outcome|saved|resolved)\b/.test(lower);
      const hasReflection = /\b(learned|next time|would do differently|reflection)\b/.test(lower);
      const hasMetric = /\d/.test(lower);

      const signalCount = [hasSituation, hasAction, hasOutcome, hasReflection].filter(Boolean).length;
      if (signalCount >= 3) {
        return {
          state: 'strong',
          strengths: ['your answer is concrete and interview-relevant'],
          gaps: [hasMetric ? 'tighten to the key points and close with a concise lesson.' : 'add one measurable signal to strengthen credibility.'],
        };
      }

      return {
        state: 'mixed',
        strengths: ['you included meaningful content'],
        gaps: ['make the decision and outcome more explicit so the impact is clear.'],
      };
    }

    const code = currentCode.trim();
    const scaffold = (problem.contract?.starterTemplate || problem.scaffold || '').trim();
    const normalizedCode = code.replace(/\s+/g, '');
    const normalizedScaffold = scaffold.replace(/\s+/g, '');
    const addedChars = Math.max(0, code.length - scaffold.length);

    const hasPassOnly = /\bpass\b/.test(code) && addedChars < 120;
    const hasFunctionOrClass = /\bdef\b|\bclass\b|function\b/.test(code);
    const hasControlFlow = /\b(for|while|if|elif|else|switch|case)\b/.test(code);
    const hasReturn = /\breturn\b/.test(code);
    const hasComments = /#|\/\/|\/\*/.test(code);

    const approachKeywords = problem.tutorPlan?.approachKeywords ?? [];
    const matchedKeywords = approachKeywords.filter((keyword) => {
      const regex = CODE_KEYWORD_PATTERNS[keyword];
      return regex ? regex.test(code) : false;
    });

    if (normalizedCode.length <= normalizedScaffold.length + 20 || hasPassOnly) {
      return {
        state: 'early',
        strengths: ['your scaffold/contract is in place'],
        gaps: ['add core logic beyond placeholders', 'state the algorithm choice before implementation.'],
      };
    }

    const strengths: string[] = [];
    const gaps: string[] = [];

    if (hasFunctionOrClass) strengths.push('the function/class contract is preserved');
    if (hasControlFlow) strengths.push('you translated logic into executable control flow');
    if (hasReturn) strengths.push('you are returning computed results explicitly');
    if (hasComments) strengths.push('you annotated key reasoning');

    if (approachKeywords.length > 0 && matchedKeywords.length === 0) {
      gaps.push('your draft does not yet reflect the expected strategy signals (data-structure/algorithm choice).');
    }
    if (!hasReturn) gaps.push('ensure the function returns the required output in all paths.');

    const complexityTarget = problem.tutorPlan?.complexityTarget;
    const nestedLoops = /for[\s\S]{0,180}for/.test(code) || /while[\s\S]{0,180}while/.test(code);
    if (nestedLoops && (complexityTarget === 'O(n)' || complexityTarget === 'O(log n)' || complexityTarget === 'O(1)')) {
      gaps.push(`current structure may exceed ${complexityTarget}; revisit complexity before submitting.`);
    }

    if (gaps.length === 0 && strengths.length >= 2) {
      return {
        state: 'strong',
        strengths: strengths.slice(0, 3),
        gaps: ['validate one edge case and confirm complexity in one sentence.'],
      };
    }

    return {
      state: 'mixed',
      strengths: strengths.length > 0 ? strengths.slice(0, 2) : ['you made meaningful progress'],
      gaps: gaps.length > 0 ? gaps.slice(0, 2) : ['verify edge cases and complexity before submitting.'],
    };
  }

  /**
   * Generate an introduction message for a problem
   * 
   * In LLM mode: Uses the live chat prompt to generate a personalized intro
   * In mock mode: Returns a template-based introduction
   * 
   * Requirements: 3.1 - WHEN an Assessment_Session begins, THE Proctor SHALL
   * introduce the problem and post the scaffold to the Code_Editor
   * 
   * @param problem The problem to introduce
   * @returns A friendly introduction message
   */
  async generateIntro(_problem: Problem): Promise<string> {
    // Realistic proctor intro - minimal and professional
    await simulateLatency(300, 600);

    return `Welcome to the assessment. When you're ready to begin, let me know.`;
  }

  /**
   * Respond to a user's question during the session
   * 
   * In LLM mode: Uses the live chat prompt to generate a contextual response
   * In mock mode: Returns pattern-matched responses
   * 
   * Requirements: 3.2, 3.3, 3.4
   * 
   * @param question The user's question
   * @param context The current session context
   * @returns A helpful response
   */
  async respondToQuestion(
      question: string,
      context: SessionContext
    ): Promise<string> {
      // LLM-first mode: if a key is configured, use AI for every user interaction.
      if (this.isLLMAvailable()) {
        try {
          const llmResponse = await this.respondToQuestionLLM(question, context);
          this.lastInteractionMode = 'llm';
          const coachedResponse = this.enforceCriticalCoaching(question, context, llmResponse);
          return this.applyNoRepeatGuard(coachedResponse, context);
        } catch (error) {
          console.warn('LLM chat call failed:', error);
          this.lastInteractionMode = 'fallback';
          return 'I hit a proctor API error on that turn. Please retry your question in one sentence.';
        }
      }

      // No API key configured: use deterministic/mock fallback.
      const localResponse = this.respondDeterministically(question, context);
      if (localResponse) {
        await simulateLatency(180, 420);
        this.lastInteractionMode = 'fallback';
        return this.applyNoRepeatGuard(localResponse, context);
      }

      const mockResponse = await this.respondToQuestionMock(question, context);
      this.lastInteractionMode = 'fallback';
      return this.applyNoRepeatGuard(mockResponse, context);
    }

  /**
   * Respond to a question using the LLM
   */
  private async respondToQuestionLLM(
    question: string,
    context: SessionContext
  ): Promise<string> {
    const apiKey = getConfiguredApiKey();
    if (!apiKey) {
      throw new LLMApiError('No API key configured');
    }

    // Build the prompt
    const { systemPrompt, userPrompt } = buildLiveChatPrompt({
      problem: context.problem,
      currentCode: context.currentCode,
      chatHistory: context.chatHistory,
      timeRemaining: context.timeRemaining,
      candidateMessage: question,
    });

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      const response = await callLLMWithRetry(
        systemPrompt,
        userPrompt,
        apiKey,
        this.abortController.signal
      );
      return response;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Respond to a question using mock responses (fallback mode)
   */
  private async respondToQuestionMock(
      question: string,
      context: SessionContext
    ): Promise<string> {
      await simulateLatency();

      const assessmentType = context.problem.assessmentType ?? 'coding';
      if (assessmentType === 'math') {
        return this.respondToMathQuestionMock(question, context);
      }
      if (assessmentType === 'behavioral') {
        return this.respondToBehavioralQuestionMock(question, context);
      }
      if (assessmentType === 'system-design') {
        return this.respondToSystemDesignQuestionMock(question, context);
      }

      const questionLower = question.toLowerCase();
      const { currentCode, timeRemaining } = context;
      const inputClarification = this.getInputClarificationResponse(questionLower, context.problem);
      if (inputClarification) {
        return inputClarification;
      }

      // Check if user has made progress
      const hasCode = currentCode && currentCode.trim().length > 50;

      // Time warning if under 5 minutes
      const timeWarning = timeRemaining < 300
        ? ` You have about ${Math.floor(timeRemaining / 60)} minutes left.`
        : '';

      // Asking for hints or help - BE HELPFUL
      if (questionLower.includes('hint') || questionLower.includes('help') || 
          questionLower.includes('stuck') || questionLower.includes("don't know")) {
        const hints = [
          'Try using a hashmap to track values you\'ve seen. That gives you O(1) lookups.',
          'Consider using two pointers - one at the start and one at the end.',
          'Think about what data structure lets you access elements quickly. Arrays and hashmaps are good for that.',
          'Start by thinking about the brute force approach, then see if you can optimize it.',
          'Break the problem down into smaller steps. What\'s the first thing you need to do?',
        ];
        return hints[Math.floor(Math.random() * hints.length)] + timeWarning;
      }

      // Asking "should I" or "how do I" - GIVE GUIDANCE
      if (questionLower.includes('should i') || questionLower.includes('how do i') || 
          questionLower.includes('would you') || questionLower.includes('can i use')) {
        const guidance = [
          'Yes, that approach would work! Go ahead and try it.',
          'That\'s a good idea. Converting to a string makes it easier to manipulate.',
          'Sure, that\'s one way to do it. You could also use a different approach, but try yours first.',
          'That sounds reasonable. Give it a shot and see if it handles the edge cases.',
          'Good thinking! That data structure would be efficient for this problem.',
        ];
        return guidance[Math.floor(Math.random() * guidance.length)];
      }

      // Asking about approach or algorithm - SUGGEST IDEAS
      if (questionLower.includes('which approach') || questionLower.includes('what algorithm') ||
          questionLower.includes('which data structure') || questionLower.includes('how to solve')) {
        const suggestions = [
          'For this problem, a hashmap would be efficient. It lets you store and look up values in O(1) time.',
          'Try the two-pointer technique. Start with one pointer at each end and move them toward the middle.',
          'A stack is useful here because you need to track the most recent items in LIFO order.',
          'Think about using a sliding window if you need to track a contiguous subarray.',
          'Dynamic programming could work if you notice overlapping subproblems.',
        ];
        return suggestions[Math.floor(Math.random() * suggestions.length)];
      }

      // Asking if something is right - GIVE FEEDBACK
      if (questionLower.includes('is this right') || questionLower.includes('is this correct') ||
          questionLower.includes('does this work') || questionLower.includes('will this')) {
        if (hasCode) {
          return 'That looks like it\'s on the right track! Make sure you test it with the examples and think about edge cases.';
        }
        return 'Try implementing it and test with the examples. That\'ll help you see if it works.';
      }

      // Clarifying questions about problem
      if (questionLower.includes('what does') || questionLower.includes('what is') || 
          questionLower.includes('what\'s') || questionLower.includes('whats') ||
          questionLower.includes('does this mean') || questionLower.includes('clarify')) {
        return 'Good question. Let me clarify: check the problem constraints and examples. What specifically is unclear?';
      }

      // Time check
      if (questionLower.includes('time') && (questionLower.includes('how much') || 
          questionLower.includes('left') || questionLower.includes('remaining'))) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        return `You have ${minutes}:${seconds.toString().padStart(2, '0')} remaining.${timeWarning}`;
      }

      // Edge cases question - HELP THEM THINK
      if (questionLower.includes('edge case') || questionLower.includes('corner case')) {
        return 'Good thinking! Consider: empty input, single element, duplicates, negative numbers, and boundary values.';
      }

      // Complexity question - EXPLAIN
      if (questionLower.includes('complexity') || questionLower.includes('big o')) {
        return 'Think about how many times you iterate through the data. If you loop once, that\'s O(n). Nested loops are O(n²). Hashmaps give O(1) lookups.';
      }

      // Candidate is narrating progress
      if (hasCode && (questionLower.includes('okay') || questionLower.includes('alright') ||
          questionLower.includes('done') || questionLower.includes('i think'))) {
        return 'Nice! Make sure to test it with the examples.';
      }

      // Default: Be encouraging and helpful
      if (!hasCode) {
        return `Start by thinking about what data structure would be most efficient. What\'s your initial idea?${timeWarning}`;
      }

      if (questionLower.includes('?')) {
        return `Good question. Be explicit about input shape, edge cases, and expected output before coding.${timeWarning}`;
      }

      return 'You\'re making progress! Keep going and test your solution.';
    }

  private getInputClarificationResponse(questionLower: string, problem: Problem): string | null {
    const asksAboutInput =
      questionLower.includes('data') ||
      questionLower.includes('input') ||
      questionLower.includes('parameter') ||
      questionLower.includes('argument') ||
      questionLower.includes('list?') ||
      questionLower.includes('string?');

    const isClarifyingQuestion =
      questionLower.includes('what') ||
      questionLower.includes('whats') ||
      questionLower.includes("what's") ||
      questionLower.includes('is') ||
      questionLower.includes('type');

    if (!asksAboutInput || !isClarifyingQuestion) {
      return null;
    }

    const signatureLine =
      problem.contract?.functionSignature
      ?? problem.scaffold
        .split('\n')
        .find((line) => line.trim().startsWith('def ') || line.trim().startsWith('class '));

    if (signatureLine) {
      const outputSummary = problem.contract?.outputSummary
        ? ` Expected output: ${problem.contract.outputSummary}.`
        : '';
      return `Use the function signature shown in the editor: \`${signatureLine.trim()}\`. Match that exact input/output contract.${outputSummary}`;
    }

    const promptLower = problem.prompt.toLowerCase();
    if (promptLower.includes('string') || promptLower.includes('chars')) {
      return 'Treat the input as a single string unless a second parameter is explicitly shown.';
    }
    if (promptLower.includes('array') || promptLower.includes('list')) {
      return 'Treat the input as an array/list unless the prompt says otherwise.';
    }
    if (promptLower.includes('matrix') || promptLower.includes('grid')) {
      return 'Treat the input as a 2D matrix/grid.';
    }

    return 'Use the function signature shown in the editor as the source of truth for input shape.';
  }

  private respondToMathQuestionMock(question: string, context: SessionContext): string {
    const questionLower = question.toLowerCase();
    const timeWarning = context.timeRemaining < 300
      ? ` You have about ${Math.max(1, Math.floor(context.timeRemaining / 60))} minutes left, so prioritize a defensible model and final recommendation.`
      : '';

    if (questionLower.includes('stuck') || questionLower.includes('help') || questionLower.includes('hint')) {
      return `Start with explicit assumptions, then write the formula, then compute one base case before sensitivity checks.${timeWarning}`;
    }

    if (questionLower.includes('is this right') || questionLower.includes('correct') || questionLower.includes('does this work')) {
      return `Walk me through units and denominators first. If units are consistent and assumptions are explicit, you're likely on track.${timeWarning}`;
    }

    if (questionLower.includes('time') && (questionLower.includes('left') || questionLower.includes('remaining'))) {
      const minutes = Math.floor(context.timeRemaining / 60);
      const seconds = context.timeRemaining % 60;
      return `You have ${minutes}:${seconds.toString().padStart(2, '0')} remaining. Focus on assumptions, one clean calculation path, then your takeaway.`;
    }

    return `Clarify your assumption set, show the exact formula, and give one sanity check range. Then state the business implication in one sentence.${timeWarning}`;
  }

  private respondToBehavioralQuestionMock(question: string, context: SessionContext): string {
    const questionLower = question.toLowerCase();
    const draft = this.extractNarrativeDraft(context.problem, context.currentCode).toLowerCase();
    const timeWarning = context.timeRemaining < 300
      ? ` You are low on time, so keep it to Situation, Action, Result, and one reflection.`
      : '';

    if (questionLower.includes('stuck') || questionLower.includes('help') || questionLower.includes('hint')) {
      const hasOutcome = /\b(result|impact|improved|reduced|increased|outcome)\b/.test(draft);
      const hasDecision = /\b(decided|chose|proposed|prioritized|recommended)\b/.test(draft);
      if (!hasDecision) {
        return `Start by stating the decision point and what options you considered. STAR is optional; paragraph format is fine.${timeWarning}`;
      }
      if (!hasOutcome) {
        return `Good start. Add the concrete outcome (preferably with one measurable signal). STAR is optional.${timeWarning}`;
      }
      return `You are close. Tighten it to decision -> action -> impact -> lesson learned. STAR is optional.${timeWarning}`;
    }

    if (
      questionLower.includes('is this right') ||
      questionLower.includes('good answer') ||
      questionLower.includes('is this good') ||
      questionLower.includes('how is that')
    ) {
      return `${this.buildNonCodingDraftFeedback(context.problem, context.currentCode)}${timeWarning}`;
    }

    if (questionLower.includes('example') || questionLower.includes('what should i say')) {
      return `Use a real case with clear stakes. Keep names generic if needed, but be specific about your actions and the result.`;
    }

    return `Keep it structured and concrete. Lead with the problem context, then your actions, then impact and what you'd improve next time.${timeWarning}`;
  }

  private respondToSystemDesignQuestionMock(question: string, context: SessionContext): string {
    const questionLower = question.toLowerCase();
    const timeWarning = context.timeRemaining < 300
      ? ` With limited time, lock the MVP architecture and call out one scaling path plus one reliability safeguard.`
      : '';

    if (questionLower.includes('stuck') || questionLower.includes('help') || questionLower.includes('hint')) {
      return `Start by clarifying requirements and scale targets, then propose a baseline architecture, then discuss tradeoffs (consistency, latency, cost).${timeWarning}`;
    }

    if (questionLower.includes('is this right') || questionLower.includes('does this make sense')) {
      return `It can work if you justify data model, bottlenecks, and failure handling. What are your read/write patterns and peak load assumptions?`;
    }

    if (questionLower.includes('time') && (questionLower.includes('left') || questionLower.includes('remaining'))) {
      const minutes = Math.floor(context.timeRemaining / 60);
      const seconds = context.timeRemaining % 60;
      return `You have ${minutes}:${seconds.toString().padStart(2, '0')} remaining. Prioritize requirements, core components, and tradeoffs.`;
    }

    return `Give me your requirements first, then core services and data flow, then one concrete tradeoff decision.${timeWarning}`;
  }

  /**
   * Evaluate the user's code submission
   * 
   * In LLM mode: Uses the evaluation prompt to get rubric-based feedback
   * In mock mode: Returns analysis-based mock evaluation
   * 
   * Requirements: 4.1 - WHEN the user clicks "I'm done" or time expires,
   * THE Proctor SHALL evaluate the Code_Editor content using the Rubric
   * 
   * @param code The user's submitted code
   * @param problem The problem being solved
   * @param chatHistory The chat history from the session
   * @returns The evaluation result
   */
  async evaluate(
      code: string,
      problem: Problem,
      chatHistory: ChatMessage[]
    ): Promise<EvaluationResult> {
      // Check if LLM mode is available
      if (this.isLLMAvailable()) {
        try {
          return await this.evaluateLLM(code, problem, chatHistory);
        } catch (error) {
          // If the API call fails for any reason, fall back to mock mode
          // This prevents the app from freezing on bad API keys or network errors
          console.warn('LLM evaluation call failed, falling back to mock mode:', error);
          return this.evaluateMock(code, problem, chatHistory);
        }
      }

      // Fall back to mock mode
      return this.evaluateMock(code, problem, chatHistory);
    }

  /**
   * Evaluate using the LLM
   */
  private async evaluateLLM(
    code: string,
    problem: Problem,
    chatHistory: ChatMessage[]
  ): Promise<EvaluationResult> {
    const apiKey = getConfiguredApiKey();
    if (!apiKey) {
      throw new LLMApiError('No API key configured');
    }

    // Calculate duration (approximate - we don't have exact start time here)
    const durationSeconds = problem.timeLimit * 60;

    // Build the prompt
    const { systemPrompt, userPrompt } = buildEvaluationPrompt({
      problem,
      finalCode: code,
      chatHistory,
      durationSeconds,
    });

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      // First attempt
      let llmResponse = await callLLMWithRetry(
        systemPrompt,
        userPrompt,
        apiKey,
        this.abortController.signal
      );

      try {
        const result = evaluationService.parseEvaluationResponse(llmResponse);
        
        // Apply fallback miss tag derivation if model omits tags
        if (result.missTags.length === 0) {
          result.missTags = deriveMissTagsFromScores(result.scores);
        }

        if (!result.annotations || result.annotations.length === 0) {
          result.annotations = buildFallbackAnnotations(
            problem,
            code,
            result.idealSolution,
            result.feedback,
            result.missTags
          );
        }

        return result;
      } catch (parseError) {
        // Only retry for parse errors
        if (!(parseError instanceof EvaluationParseError)) {
          throw parseError;
        }

        // Retry with stricter prompt
        const retryPrompt = userPrompt +
          '\n\nIMPORTANT: Respond with ONLY valid JSON that matches the required schema exactly. No markdown, no code fences, no extra text.';

        llmResponse = await callLLMWithRetry(
          systemPrompt,
          retryPrompt,
          apiKey,
          this.abortController.signal
        );

        const result = evaluationService.parseEvaluationResponse(llmResponse);

        // Apply fallback miss tag derivation if model omits tags
        if (result.missTags.length === 0) {
          result.missTags = deriveMissTagsFromScores(result.scores);
        }

        if (!result.annotations || result.annotations.length === 0) {
          result.annotations = buildFallbackAnnotations(
            problem,
            code,
            result.idealSolution,
            result.feedback,
            result.missTags
          );
        }

        return result;
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Evaluate using mock responses (fallback mode)
   */
  private async evaluateMock(
    code: string,
    problem: Problem,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _chatHistory: ChatMessage[]
  ): Promise<EvaluationResult> {
    await simulateLatency(800, 1500); // Slightly longer delay for evaluation

    const assessmentType = problem.assessmentType ?? 'coding';
    if (assessmentType === 'math' || assessmentType === 'behavioral' || assessmentType === 'system-design') {
      return this.evaluateNonCodingMock(code, problem, assessmentType);
    }

    return this.evaluateCodingMock(code, problem);
  }

  private evaluateCodingMock(code: string, problem: Problem): EvaluationResult {
    const draft = this.analyzeDraftQuality(problem, code);
    const hasComments = code.includes('#') || code.includes('//') || code.includes('/*') || code.includes('"""');
    const hasTests = /\b(assert|pytest|unittest|example|edge case)\b/i.test(code);

    let approach = 2;
    let completeness = 2;
    let complexity = 2;
    let communication = hasComments ? 3 : 2;

    if (draft.state === 'early') {
      approach = 2;
      completeness = 1;
      complexity = 1;
      communication = Math.max(2, communication);
    } else if (draft.state === 'mixed') {
      approach = 3;
      completeness = 2;
      complexity = 2;
      communication = Math.max(3, communication);
    } else {
      approach = 4;
      completeness = hasTests ? 4 : 3;
      complexity = 3;
      communication = hasComments ? 4 : 3;
    }

    if (problem.tutorPlan?.complexityTarget === 'O(log n)' && /\bmid\b/.test(code)) {
      complexity = Math.min(4, complexity + 1);
    }
    if (problem.tutorPlan?.complexityTarget === 'O(n)' && /for[\s\S]{0,180}for/.test(code)) {
      complexity = Math.max(1, complexity - 1);
    }

    const strengths: string[] = draft.strengths.length > 0
      ? draft.strengths.map((s) => `Strength: ${s}.`)
      : ['Strength: you produced a draft under interview constraints.'];
    const improvements: string[] = draft.gaps.length > 0
      ? draft.gaps.map((g) => `Improve: ${g}`)
      : ['Improve: validate one more edge case before final submission.'];

    if (problem.commonPitfalls.length > 0) {
      improvements.push(`Improve: watch for this pitfall — ${problem.commonPitfalls[0]}.`);
    }

    return this.buildMockEvaluationResult(
      problem,
      { approach, completeness, complexity, communication },
      strengths,
      improvements,
      code
    );
  }

  private evaluateNonCodingMock(
    responseText: string,
    problem: Problem,
    assessmentType: 'math' | 'behavioral' | 'system-design'
  ): EvaluationResult {
    const text = responseText.trim();
    const length = text.length;

    const hasNumbers = /\d/.test(text);
    const sentenceCount = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter(Boolean).length;
    const hasTradeoffs = /\b(tradeoff|pros|cons|risk|cost|benefit)\b/i.test(text);
    const hasConclusion = /\b(therefore|so|recommend|final|in summary|bottom line)\b/i.test(text);

    let approach = 2;
    let completeness = 2;
    let complexity = 2;
    let communication = sentenceCount >= 3 ? 3 : 2;

    if (assessmentType === 'math') {
      const hasFormula = /[=/*+\-]|\bformula\b/i.test(text);
      const hasAssumptions = /\b(assumption|assume|given)\b/i.test(text);
      const hasUnits = /\b(usd|%|month|year|annual|monthly)\b/i.test(text);
      const hasSensitivity = /\b(sensitivity|scenario|range|best case|worst case)\b/i.test(text);

      approach = hasAssumptions && hasFormula ? 3 : 2;
      completeness = hasNumbers && hasUnits ? 3 : 2;
      complexity = hasSensitivity || hasTradeoffs ? 3 : 2;
      communication = hasConclusion ? Math.max(communication, 3) : communication;
    } else if (assessmentType === 'behavioral') {
      const hasSituation = /\b(situation|context|when i|at my)\b/i.test(text);
      const hasAction = /\b(i led|i proposed|i implemented|i decided|action)\b/i.test(text);
      const hasResult = /\b(result|impact|improved|reduced|increased|outcome)\b/i.test(text);
      const hasReflection = /\b(learned|next time|in hindsight|would do differently)\b/i.test(text);

      approach = hasSituation && hasAction ? 3 : 2;
      completeness = hasResult && hasReflection ? 3 : 2;
      complexity = hasTradeoffs ? 3 : 2;
      communication = hasConclusion ? Math.max(communication, 3) : communication;
    } else {
      const hasRequirements = /\b(requirement|latency|throughput|qps|sla)\b/i.test(text);
      const hasComponents = /\b(api|service|database|cache|queue|worker|load balancer)\b/i.test(text);
      const hasReliability = /\b(retry|fallback|monitor|alert|failure|idempot)\b/i.test(text);

      approach = hasRequirements && hasComponents ? 3 : 2;
      completeness = hasComponents && hasReliability ? 3 : 2;
      complexity = hasTradeoffs ? 3 : 2;
      communication = hasConclusion ? Math.max(communication, 3) : communication;
    }

    if (length > 900) {
      communication = Math.max(1, communication - 1);
    }
    if (length < 80) {
      completeness = Math.max(1, completeness - 1);
      communication = Math.max(1, communication - 1);
    }

    const strengths: string[] = [];
    const improvements: string[] = [];

    if (approach >= 3) strengths.push('Your framing and approach were on the right track.');
    if (completeness >= 3) strengths.push('You covered the key components needed for this prompt.');
    if (complexity >= 3) strengths.push('You discussed tradeoffs instead of giving a one-dimensional answer.');
    if (communication >= 3) strengths.push('Your explanation was structured and easy to follow.');
    if (strengths.length === 0) strengths.push('You attempted a full response under interview constraints.');

    if (approach < 3) improvements.push('State your approach upfront before details.');
    if (completeness < 3) improvements.push('Cover all required parts before closing.');
    if (complexity < 3) improvements.push('Add one concrete tradeoff or risk discussion.');
    if (communication < 3) improvements.push('Use shorter structured sections with a crisp conclusion.');
    if (problem.commonPitfalls.length > 0) improvements.push(`Avoid this pitfall: ${problem.commonPitfalls[0]}.`);

    return this.buildMockEvaluationResult(problem, {
      approach,
      completeness,
      complexity,
      communication,
    }, strengths, improvements, responseText);
  }

  private buildMockEvaluationResult(
    problem: Problem,
    scores: EvaluationResult['scores'],
    strengths: string[],
    improvements: string[],
    candidateText: string
  ): EvaluationResult {
    const idealSolution = this.generateIdealSolution(problem);
    const missTags = deriveMissTagsFromScores(scores);
    const feedback = {
      strengths: strengths.slice(0, 3),
      improvements: improvements.slice(0, 3),
    };

    return {
      verdict: this.calculateVerdict(scores),
      scores,
      feedback,
      idealSolution,
      missTags,
      annotations: buildFallbackAnnotations(
        problem,
        candidateText,
        idealSolution,
        feedback,
        missTags
      ),
    };
  }

  private calculateVerdict(scores: EvaluationResult['scores']): 'Pass' | 'Borderline' | 'No Pass' {
    const total = scores.approach + scores.completeness + scores.complexity + scores.communication;
    const minScore = Math.min(scores.approach, scores.completeness, scores.complexity, scores.communication);

    if (total >= 13 && minScore >= 3) {
      return 'Pass';
    }
    if (total <= 8 || scores.approach <= 1) {
      return 'No Pass';
    }
    return 'Borderline';
  }

  /**
   * Generate an ideal solution for a problem
   * 
   * @param problem The problem to generate a solution for
   * @returns A string containing the ideal solution code
   */
  private generateIdealSolution(problem: Problem): string {
      const curated = CURATED_IDEAL_SOLUTIONS[problem.id] ?? NEETCODE_CURATED_IDEAL_SOLUTIONS[problem.id];
      if (curated) {
        return curated;
      }

      // Return problem-specific ideal solutions in Python
      switch (problem.id) {
        case 'fizzbuzz':
          return `def fizz_buzz(n: int) -> list[str]:
      result = []

      for i in range(1, n + 1):
          if i % 15 == 0:
              result.append("FizzBuzz")
          elif i % 3 == 0:
              result.append("Fizz")
          elif i % 5 == 0:
              result.append("Buzz")
          else:
              result.append(str(i))

      return result

  # Key insight: Check for divisibility by 15 first (or both 3 AND 5)
  # to handle the FizzBuzz case before checking individual divisibility.
  # Time complexity: O(n), Space complexity: O(n) for the result list.`;

        case 'two-sum':
          return `def two_sum(nums: list[int], target: int) -> list[int]:
      seen = {}

      for i, num in enumerate(nums):
          complement = target - num

          if complement in seen:
              return [seen[complement], i]

          seen[num] = i

      return []  # No solution found (shouldn't happen per constraints)

  # Key insight: Use a dictionary to store numbers we've seen and their indices.
  # For each number, check if its complement (target - current) exists in the dict.
  # Time complexity: O(n), Space complexity: O(n) for the dictionary.`;

        case 'valid-parentheses':
          return `def is_valid(s: str) -> bool:
      stack = []
      pairs = {")": "(", "]": "[", "}": "{"}

      for char in s:
          if char in pairs.values():
              stack.append(char)
          elif char in pairs:
              if not stack or stack.pop() != pairs[char]:
                  return False

      return len(stack) == 0

  # Key insight: Use a stack to track opening brackets.
  # When we see a closing bracket, the most recent opening bracket must match.
  # Time complexity: O(n), Space complexity: O(n) for the stack.`;

        case 'reverse-string':
          return `def reverse_string(s: list[str]) -> None:
      left = 0
      right = len(s) - 1

      while left < right:
          s[left], s[right] = s[right], s[left]
          left += 1
          right -= 1

  # Key insight: Use two pointers, one at each end, and swap characters
  # while moving toward the center. This achieves O(1) extra space.
  # Time complexity: O(n), Space complexity: O(1).`;

        case 'palindrome-number':
          return `def is_palindrome(x: int) -> bool:
      # Negative numbers are never palindromes
      if x < 0:
          return False

      # Numbers ending in 0 are only palindromes if they are 0
      if x != 0 and x % 10 == 0:
          return False

      reversed_num = 0
      original = x

      while x > 0:
          reversed_num = reversed_num * 10 + x % 10
          x //= 10

      return original == reversed_num

  # Key insight: Reverse the number mathematically and compare.
  # Handle edge cases: negative numbers and numbers ending in 0.
  # Time complexity: O(log n), Space complexity: O(1).`;

        default:
          // No generic template fallback: only curated or explicitly maintained references.
          return '';
      }
    }
}

// Export singleton instance for convenience
export const proctorService = new ProctorService();
