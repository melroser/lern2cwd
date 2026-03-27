/**
 * Problem Bank for the Coding Interview Simulator
 *
 * Contains curated coding problems with consistent structure for fair evaluation.
 *
 * Requirements: 8.1, 8.3
 * - Store problems as JSON with: title, prompt, constraints, examples, expected approach notes,
 *   common pitfalls, ideal solution outline, language
 * - Load problems from the Problem_Bank for each Assessment_Session
 */

import type { Problem } from '../types';

export const problems: Problem[] = [
  {
    id: 'adjacent-elements-sum',
    language: 'python',
    title: 'Adjacent Elements Sum',
    difficulty: 'easy',
    timeLimit: 12,
    prompt: `Given an array a, output an array b of the same length by applying the following transformation:

For each index i:
- b[i] = a[i - 1] + a[i] + a[i + 1]
- If an element does not exist (out of bounds), use 0 in its place.

Example:
For a = [4, 0, 1, -2, 3]
b = [4, 5, -1, 2, 1] because:
b[0] = 0 + 4 + 0 = 4
b[1] = 4 + 0 + 1 = 5
b[2] = 0 + 1 + (-2) = -1
b[3] = 1 + (-2) + 3 = 2
b[4] = (-2) + 3 + 0 = 1`,
    constraints: [
      'Constraints not explicitly provided',
      'a is an array of integers',
    ],
    scaffold: `def solution(a: list[int]) -> list[int]:
    # Your code here
    pass`,
    examples: [
      {
        input: 'a = [4, 0, 1, -2, 3]',
        output: '[4, 5, -1, 2, 1]',
        explanation: 'Sum each element with its neighbors, using 0 for missing neighbors.',
      },
      {
        input: 'a = [5]',
        output: '[5]',
        explanation: 'b[0] = 0 + 5 + 0',
      },
      {
        input: 'a = [1, 2, 3]',
        output: '[3, 6, 5]',
        explanation: '[0+1+2, 1+2+3, 2+3+0]',
      },
    ],
    expectedApproach:
      'Single pass. For each i, start with a[i], add a[i-1] if i>0, add a[i+1] if i<n-1.',
    commonPitfalls: [
      'Off-by-one errors at the ends (i=0 and i=n-1)',
      'Mutating the input array and then reading modified values',
      'Forgetting to handle n=1',
    ],
    idealSolutionOutline:
      'Create result array b sized n. For i in [0..n-1]: b[i] = a[i] + (a[i-1] if i>0 else 0) + (a[i+1] if i<n-1 else 0). Return b.',
    evaluationNotes:
      'Look for correct boundary handling and O(n) time. Any equivalent approach is fine.',
  },

  {
    id: 'pattern-vowel-consonant-substrings',
    language: 'python',
    title: 'Pattern Match: Vowels vs Consonants',
    difficulty: 'medium',
    timeLimit: 20,
    prompt: `You are given two strings: pattern and source.
- pattern contains only '0' and '1'
- source contains only lowercase English letters

Count how many substrings of source match pattern.

A substring source[l..r] matches pattern if:
1) The substring and pattern are the same length
2) Wherever pattern has '0', the substring has a vowel
3) Wherever pattern has '1', the substring has a consonant

Vowels are: a, e, i, o, u, y (and all other letters are consonants)

Example:
pattern = "010", source = "amazing" -> 2 matches
- "ama" (vowel, consonant, vowel)
- "azi" (vowel, consonant, vowel)`,
    constraints: [
      '1 ≤ source.length ≤ 10^3',
      '1 ≤ pattern.length ≤ 10^3',
    ],
    scaffold: `def solution(pattern: str, source: str) -> int:
    # Your code here
    pass`,
    examples: [
      {
        input: 'pattern = "010", source = "amazing"',
        output: '2',
        explanation: '"ama" and "azi" match vowel/consonant/vowel.',
      },
      {
        input: 'pattern = "100", source = "codesignal"',
        output: '0',
        explanation: 'Requires consonant then two vowels; no such substring exists here.',
      },
      {
        input: 'pattern = "0", source = "myth"',
        output: '1',
        explanation: 'Only "y" counts as a vowel here.',
      },
    ],
    expectedApproach:
      'Brute force sliding window over all start indices; for each window, verify each character matches vowel/consonant requirement. Use a set for vowels for O(1) checks.',
    commonPitfalls: [
      'Forgetting that y is a vowel (per problem statement)',
      'Not handling pattern longer than source (should return 0)',
      'Confusing 0/1 meaning (0=vowel, 1=consonant)',
    ],
    idealSolutionOutline:
      'Let m=len(pattern), n=len(source). For start in 0..n-m: check all k in 0..m-1 that (pattern[k]==0 => source[start+k] in vowels) and (pattern[k]==1 => not in vowels). Count matches.',
    evaluationNotes:
      'Given constraints up to 1e3, O(n*m) is acceptable. Reward clean checks and correct vowel set.',
  },

  {
    id: 'drop-figure-to-complete-row',
    language: 'python',
    title: 'Drop a 3×3 Figure to Complete a Row',
    difficulty: 'hard',
    timeLimit: 35,
    prompt: `You are given:
- field: a height × width matrix of 0/1 (1 = occupied, 0 = free)
- figure: a 3 × 3 matrix of 0/1 (1 = occupied)

You choose a column position where the top-left of the 3×3 figure will align in the field, then drop the figure down.
The figure falls until it reaches the ground (bottom) or lands on an occupied cell (collision).

After it stops, some row(s) in the field may become fully occupied (all 1s).
Return a column index such that dropping the figure at that column results in at least one full row.

Rules:
- The entire 3×3 figure must fit inside the field horizontally and vertically (even if parts of the 3×3 are empty).
- If multiple columns work, return any.
- If none work, return -1.`,
    constraints: [
      'Constraints not explicitly provided',
      'field is a rectangular matrix containing only 0 and 1',
      'figure is always 3×3 containing only 0 and 1',
    ],
    scaffold: `def solution(field: list[list[int]], figure: list[list[int]]) -> int:
    # Your code here
    pass`,
    examples: [
      {
        input:
          'field = [[0,0,0],[0,0,0],[0,0,0],[1,0,0],[1,1,0]]\nfigure = [[0,0,1],[0,1,1],[0,0,1]]',
        output: '0',
        explanation:
          'Only one valid column in a 3-wide field; dropping completes full row(s).',
      },
    ],
    expectedApproach:
      'Simulate each possible column. For each column, simulate falling row-by-row until the next step would collide or hit bottom. Then compute if any affected row becomes full after placing the figure.',
    commonPitfalls: [
      'Collision detection: must check only cells where figure has 1s',
      'Stopping height: off-by-one when figure can no longer move down',
      'Row-completion check: consider both existing field blocks and newly placed figure blocks',
      'Forgetting that the 3×3 must fit inside field (so column range is width-3 inclusive)',
    ],
    idealSolutionOutline:
      'For each col in [0..width-3]: find the final row by advancing while placement at row+1 is valid. Place virtually (without mutating original), then check all rows touched by the figure for fullness. Return col if any full row forms, else -1.',
    evaluationNotes:
      'This is a simulation problem. Reward clear collision logic and careful indexing. Mutating a copy of field is fine.',
  },

  {
    id: 'pairs-sum-to-power-of-two',
    language: 'python',
    title: 'Pairs Summing to a Power of Two',
    difficulty: 'medium',
    timeLimit: 25,
    prompt: `Given an array of unique integers numbers, count the number of pairs of indices (i, j) such that:
- i ≤ j
- numbers[i] + numbers[j] equals a power of 2 (2^0=1, 2^1=2, 2^2=4, ...)

Examples:
numbers = [1, -1, 2, 3] -> 5
numbers = [2] -> 1
numbers = [-2, -1, 0, 1, 2] -> 5`,
    constraints: [
      '1 ≤ numbers.length ≤ 10^5',
      '-10^6 ≤ numbers[i] ≤ 10^6',
      'All integers are unique',
    ],
    scaffold: `def solution(numbers: list[int]) -> int:
    # Your code here
    pass`,
    examples: [
      {
        input: 'numbers = [1, -1, 2, 3]',
        output: '5',
        explanation:
          'Pairs whose sums are powers of two include (0,0)->2, (1,2)->1, (1,3)->2, (0,3)->4, (2,2)->4.',
      },
      {
        input: 'numbers = [2]',
        output: '1',
        explanation: '(0,0): 2+2 = 4 which is 2^2.',
      },
      {
        input: 'numbers = [-2, -1, 0, 1, 2]',
        output: '5',
        explanation: 'Multiple pairs hit 1,2,4.',
      },
    ],
    expectedApproach:
      'Use a hash map of seen counts while iterating. For each element x, for each relevant power-of-two sum S, add count[S - x] to answer. Include i=j cases naturally by adding x to counts before/after carefully.',
    commonPitfalls: [
      'Double counting (especially if you count both (i,j) and (j,i))',
      'Forgetting i ≤ j allows i=j (self-pairs)',
      'Not choosing enough powers of two to cover the possible sum range',
      'Assuming numbers are small without using constraints',
    ],
    idealSolutionOutline:
      'Let max abs value be 1e6 so sums are in [-2e6, 2e6]. Powers of two to check up to at least 2^21 (~2.1e6) or a bit higher. Iterate numbers: maintain dict counts. For each x: for p in powers: ans += counts[p - x]. Then counts[x] += 1. (This counts pairs with earlier indices; to include i=j, ensure p-x == x hits after counts[x] increment depending on desired ordering; easiest: increment counts[x] first, then add counts[p-x] including itself, which matches i≤j.)',
    evaluationNotes:
      'Best solutions are ~O(n * log range). Look for correct power range and correct counting without double-counting.',
  },
];

export default problems;