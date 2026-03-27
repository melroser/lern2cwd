/**
 * ProblemService - Manages categorized problem banks.
 *
 * Keeps API-compatible random retrieval while allowing selectable problem sets.
 */

import type {
  AssessmentType,
  Difficulty,
  Problem,
  ProblemServiceInterface,
  ProblemSetOption,
  ProgrammingLanguage,
} from '../types';
import neetcode50Raw from '../data/problemSets/neetcode-50.json';
import codeSignalRaw from '../data/problemSets/codesignal-tech-force.json';
import cfoModeRaw from '../data/problemSets/cfo-mode.json';
import wordpressRaw from '../data/problemSets/frontend-wordpress.json';
import dotnetRaw from '../data/problemSets/junior-dotnet.json';
import npRaw from '../data/problemSets/np-occupational-health-fl.json';
import behavioralRaw from '../data/problemSets/behavioral-software-engineering.json';
import pythonFundamentalsRaw from '../data/problemSets/python-fundamentals.json';
import pythonIntermediateRaw from '../data/problemSets/python-intermediate.json';
import outrivalExperimentationRaw from '../data/problemSets/outrival-experimentation-statistics.json';
import outrivalPlatformReliabilityRaw from '../data/problemSets/outrival-platform-reliability.json';
import synthbeeWilliamRaw from '../data/problemSets/synthbee-william-screen.json';
import synthbeeConversationalRaw from '../data/problemSets/synthbee-conversational-screen.json';

type RawProblem = Partial<Problem> & {
  id: string;
  title: string;
  prompt: string;
};

type CodingProblemOverride = {
  description?: string;
  signature: string;
  inputSummary: string;
  outputSummary: string;
  constraints: string[];
  examples: Problem['examples'];
  expectedApproach: string;
  commonPitfalls: string[];
};

const PROBLEM_SET_REGISTRY: Omit<ProblemSetOption, 'questionCount'>[] = [
  {
    id: 'neetcode-50',
    label: 'NeetCode 50',
    description: 'Core coding interview patterns and algorithms.',
    assessmentType: 'coding',
    domain: 'software-engineering',
    defaultSelected: true,
  },
  {
    id: 'codesignal-tech-force',
    label: 'CodeSignal Tech Force',
    description: 'CodeSignal-style timed algorithm and implementation drills.',
    assessmentType: 'coding',
    domain: 'software-engineering',
    defaultSelected: true,
  },
  {
    id: 'behavioral-software-engineering',
    label: 'Behavioral SWE',
    description: 'Behavioral interview prompts for software engineers.',
    assessmentType: 'behavioral',
    domain: 'software-engineering',
  },
  {
    id: 'python-fundamentals',
    label: 'Python Fundamentals',
    description: 'Core Python, CSV, data-structure, and interview-control drills.',
    assessmentType: 'coding',
    domain: 'python-fundamentals',
  },
  {
    id: 'python-intermediate',
    label: 'Python Intermediate',
    description: 'Backend-flavored FastAPI, SQL, Docker, and deployment drills.',
    assessmentType: 'coding',
    domain: 'python-intermediate',
  },
  {
    id: 'outrival-experimentation-statistics',
    label: 'Outrival Experimentation & Statistics',
    description: 'Product experimentation, statistics, and decision-quality interview drills.',
    assessmentType: 'math',
    domain: 'product-experimentation',
  },
  {
    id: 'outrival-platform-reliability',
    label: 'Outrival Platform Reliability',
    description: 'Platform reliability, systems judgment, and engineering leadership prompts.',
    assessmentType: 'behavioral',
    domain: 'platform-reliability',
  },
  {
    id: 'synthbee-william-screen',
    label: 'SynthBee William Screen',
    description: 'Role-fit, AI systems, and system-design interview prompts for SynthBee.',
    assessmentType: 'behavioral',
    domain: 'software-engineering-ai-systems',
  },
  {
    id: 'synthbee-conversational-screen',
    label: 'SynthBee Conversational Screen',
    description: 'Conversational AI systems and engineering judgment prompts for SynthBee.',
    assessmentType: 'behavioral',
    domain: 'software-engineering-ai-systems',
  },
  {
    id: 'cfo-mode',
    label: 'CFO Mode',
    description: 'Finance and startup metrics interview drills.',
    assessmentType: 'math',
    domain: 'finance',
  },
  {
    id: 'frontend-wordpress',
    label: 'Frontend WordPress',
    description: 'Frontend implementation and accessibility scenarios.',
    assessmentType: 'coding',
    domain: 'frontend-wordpress',
  },
  {
    id: 'junior-dotnet',
    label: 'Junior .NET',
    description: '.NET backend architecture and API scenarios.',
    assessmentType: 'coding',
    domain: 'junior-dotnet',
  },
  {
    id: 'np-occupational-health-fl',
    label: 'NP Occupational Health (FL)',
    description: 'Occupational-health case assessments for demo mode.',
    assessmentType: 'behavioral',
    domain: 'healthcare',
  },
];

const RAW_PROBLEMS_BY_SET: Record<string, RawProblem[]> = {
  'neetcode-50': neetcode50Raw as RawProblem[],
  'codesignal-tech-force': codeSignalRaw as RawProblem[],
  'cfo-mode': cfoModeRaw as RawProblem[],
  'frontend-wordpress': wordpressRaw as RawProblem[],
  'junior-dotnet': dotnetRaw as RawProblem[],
  'np-occupational-health-fl': npRaw as RawProblem[],
  'behavioral-software-engineering': behavioralRaw as RawProblem[],
  'python-fundamentals': pythonFundamentalsRaw as RawProblem[],
  'python-intermediate': pythonIntermediateRaw as RawProblem[],
  'outrival-experimentation-statistics': outrivalExperimentationRaw as RawProblem[],
  'outrival-platform-reliability': outrivalPlatformReliabilityRaw as RawProblem[],
  'synthbee-william-screen': synthbeeWilliamRaw as RawProblem[],
  'synthbee-conversational-screen': synthbeeConversationalRaw as RawProblem[],
};

const CODING_PROBLEM_OVERRIDES: Record<string, CodingProblemOverride> = {
  'codesignal-first-duplicate': {
    signature: 'def first_duplicate(a: list[int]) -> int:',
    inputSummary: 'a: integer array where each value is in [1, len(a)].',
    outputSummary: 'First duplicated value whose second occurrence appears earliest, or -1 if none.',
    constraints: [
      '1 <= len(a) <= 100000',
      '1 <= a[i] <= len(a)',
      'Return -1 if no duplicate exists',
    ],
    examples: [
      {
        input: 'a = [2, 1, 3, 5, 3, 2]',
        output: '3',
        explanation: '3 repeats at index 4 before 2 repeats at index 5.',
      },
      {
        input: 'a = [2, 4, 3, 5, 1]',
        output: '-1',
        explanation: 'No value appears twice.',
      },
    ],
    expectedApproach: 'Scan left-to-right with a seen set; first repeated value is the answer.',
    commonPitfalls: ['Sorting first (breaks earliest-second-occurrence rule)', 'Returning index instead of value'],
  },
  'codesignal-rotate-image': {
    signature: 'def rotate_image(a: list[list[int]]) -> list[list[int]]:',
    inputSummary: 'a: n x n matrix of integers.',
    outputSummary: 'Matrix rotated 90 degrees clockwise.',
    constraints: ['a is square', 'Aim for O(1) extra space using transpose + reverse'],
    examples: [
      {
        input: 'a = [[1,2,3],[4,5,6],[7,8,9]]',
        output: '[[7,4,1],[8,5,2],[9,6,3]]',
        explanation: 'Transpose then reverse each row.',
      },
    ],
    expectedApproach: 'Transpose matrix, then reverse each row in place.',
    commonPitfalls: ['Using extra matrix when in-place is expected', 'Mixing clockwise vs counterclockwise'],
  },
  'codesignal-sudoku2': {
    signature: 'def sudoku2(grid: list[str]) -> bool:',
    inputSummary: "grid: 9 strings of length 9, each char is '1'..'9' or '.'.",
    outputSummary: 'True if no row, column, or 3x3 subgrid has duplicate digits.',
    constraints: ['Grid is always 9x9', "'.' means empty cell"],
    examples: [
      {
        input: "grid = ['.87654321','2........','3........','4........','5........','6........','7........','8........','9........']",
        output: 'True',
        explanation: 'No duplicates in any row, column, or box.',
      },
    ],
    expectedApproach: 'Track seen digits per row, column, and subgrid with hash sets.',
    commonPitfalls: ['Not skipping "." cells', 'Wrong subgrid key math'],
  },
  'codesignal-is-crypt-solution': {
    signature: 'def is_crypt_solution(crypt: list[str], solution: list[list[str]]) -> bool:',
    inputSummary: 'crypt: 3 words; solution: letter->digit mappings.',
    outputSummary: 'True if decoded words satisfy word1 + word2 == word3 and no leading zeros.',
    constraints: ['All mapped digits are unique', 'No leading zero for multi-char words'],
    examples: [
      {
        input: "crypt = ['SEND','MORE','MONEY'], solution = [['O','0'],['M','1'],['Y','2'],['E','5'],['N','6'],['D','7'],['R','8'],['S','9']]",
        output: 'True',
        explanation: '9567 + 1085 = 10652 and no invalid leading zeros.',
      },
    ],
    expectedApproach: 'Build a map, decode each word, reject leading zeros, then verify equation.',
    commonPitfalls: ['Forgetting leading-zero rule', 'Mishandling string-to-int conversion'],
  },
  'codesignal-sort-by-height': {
    signature: 'def sort_by_height(a: list[int]) -> list[int]:',
    inputSummary: 'a: integers where -1 represents trees that cannot move.',
    outputSummary: 'Array with non-tree heights sorted ascending, trees fixed in place.',
    constraints: ['Preserve index positions of -1 values'],
    examples: [
      {
        input: 'a = [-1, 150, 190, 170, -1, -1, 160, 180]',
        output: '[-1, 150, 160, 170, -1, -1, 180, 190]',
        explanation: 'Only non -1 values are sorted and reinserted.',
      },
    ],
    expectedApproach: 'Extract non-tree values, sort them, then refill original array positions.',
    commonPitfalls: ['Sorting whole array including -1', 'Reinserting in wrong positions'],
  },
  'codesignal-are-similar': {
    signature: 'def are_similar(a: list[int], b: list[int]) -> bool:',
    inputSummary: 'a, b: same-length integer arrays.',
    outputSummary: 'True if arrays are equal or can be made equal with at most one swap in one array.',
    constraints: ['Compare mismatch positions directly'],
    examples: [
      {
        input: 'a = [1, 2, 3], b = [1, 3, 2]',
        output: 'True',
        explanation: 'Swap positions 1 and 2 in b.',
      },
      {
        input: 'a = [1, 2, 2], b = [2, 1, 1]',
        output: 'False',
        explanation: 'More than one valid mismatch pair is required.',
      },
    ],
    expectedApproach: 'Collect mismatch indices; valid only when mismatch count is 0 or 2 with cross-match.',
    commonPitfalls: ['Ignoring value counts', 'Allowing more than one swap'],
  },
  'codesignal-array-change': {
    signature: 'def array_change(input_array: list[int]) -> int:',
    inputSummary: 'input_array: integer array.',
    outputSummary: 'Minimum increments needed to make array strictly increasing.',
    constraints: ['Only increment operations are allowed'],
    examples: [
      {
        input: 'input_array = [1, 1, 1]',
        output: '3',
        explanation: 'Transform to [1,2,3] with 1 + 2 increments.',
      },
    ],
    expectedApproach: 'Greedy left-to-right: raise each value to at least previous+1 and add cost.',
    commonPitfalls: ['Not accumulating total increment count', 'Using non-greedy adjustments'],
  },
  'codesignal-palindrome-rearranging': {
    signature: 'def palindrome_rearranging(s: str) -> bool:',
    inputSummary: 's: input string.',
    outputSummary: 'True if characters can be rearranged to form a palindrome, otherwise False.',
    constraints: ['Use character frequency counts', 'At most one character may have odd frequency'],
    examples: [
      {
        input: 's = "aabb"',
        output: 'True',
        explanation: 'All character counts are even.',
      },
      {
        input: 's = "abcad"',
        output: 'False',
        explanation: 'More than one odd-count character exists.',
      },
    ],
    expectedApproach: 'Count frequencies and ensure odd-count characters <= 1.',
    commonPitfalls: ['Checking adjacency instead of counts', 'Forgetting odd-count rule'],
  },
  'codesignal-avoid-obstacles': {
    signature: 'def avoid_obstacles(input_array: list[int]) -> int:',
    inputSummary: 'input_array: obstacle positions on positive number line.',
    outputSummary: 'Smallest jump length that avoids all obstacles from position 0.',
    constraints: ['Jump length must be positive integer', 'Test jump lengths incrementally'],
    examples: [
      {
        input: 'input_array = [5, 3, 6, 7, 9]',
        output: '4',
        explanation: 'Multiples of 4 avoid all obstacle positions.',
      },
    ],
    expectedApproach: 'Try jump sizes from 2 upward until no obstacle is divisible by jump.',
    commonPitfalls: ['Starting jump at 1 unnecessarily', 'Not testing all obstacles'],
  },
  'codesignal-box-blur': {
    signature: 'def box_blur(image: list[list[int]]) -> list[list[int]]:',
    inputSummary: 'image: 2D integer matrix.',
    outputSummary: 'Blurred matrix where each cell is floor(avg of a 3x3 window).',
    constraints: ['Use integer division/floor', 'Output dimensions are (h-2) x (w-2)'],
    examples: [
      {
        input: 'image = [[1,1,1],[1,7,1],[1,1,1]]',
        output: '[[1]]',
        explanation: 'Sum is 15; floor(15/9) = 1.',
      },
    ],
    expectedApproach: 'Iterate each valid 3x3 window, sum values, divide by 9 with floor.',
    commonPitfalls: ['Wrong output dimensions', 'Using round instead of floor'],
  },
  'codesignal-minesweeper': {
    signature: 'def minesweeper(matrix: list[list[bool]]) -> list[list[int]]:',
    inputSummary: 'matrix: boolean minefield; True = mine.',
    outputSummary: 'Integer matrix of adjacent mine counts for every cell.',
    constraints: ['Count all 8 neighbors', 'Bounds-check each neighbor'],
    examples: [
      {
        input: 'matrix = [[True,False,False],[False,True,False],[False,False,False]]',
        output: '[[1,2,1],[2,1,1],[1,1,1]]',
        explanation: 'Each output cell counts nearby True cells.',
      },
    ],
    expectedApproach: 'For each cell, scan 8 directions and count valid mine neighbors.',
    commonPitfalls: ['Off-by-one in neighbor loops', 'Including current cell in count'],
  },
  'codesignal-array-max-consecutive-sum': {
    signature: 'def array_max_consecutive_sum(input_array: list[int], k: int) -> int:',
    inputSummary: 'input_array: integer list; k: fixed subarray length.',
    outputSummary: 'Maximum sum over all contiguous subarrays of length k.',
    constraints: ['1 <= k <= len(input_array)', 'Prefer O(n) sliding window'],
    examples: [
      {
        input: 'input_array = [2, 3, 5, 1, 6], k = 2',
        output: '8',
        explanation: 'Max window is [3,5].',
      },
    ],
    expectedApproach: 'Use sliding window: initialize first k sum, then add right/remove left.',
    commonPitfalls: ['Recomputing each window sum in O(k)', 'Wrong initial window'],
  },
  'codesignal-digits-product': {
    signature: 'def digits_product(product: int) -> int:',
    inputSummary: 'product: target digit product.',
    outputSummary: 'Smallest positive integer whose digits multiply to product, or -1 if impossible.',
    constraints: ['Handle product = 0 and product = 1 carefully'],
    examples: [
      {
        input: 'product = 12',
        output: '26',
        explanation: '2 * 6 = 12 and 26 is the smallest valid integer.',
      },
      {
        input: 'product = 19',
        output: '-1',
        explanation: '19 cannot be factored into digits 2..9.',
      },
    ],
    expectedApproach: 'Factor product by digits 9..2, reverse factors, and compose integer.',
    commonPitfalls: ['Missing product=0/product=1 edge cases', 'Not returning smallest order'],
  },
  'codesignal-file-naming': {
    signature: 'def file_naming(names: list[str]) -> list[str]:',
    inputSummary: 'names: proposed file names in order.',
    outputSummary: 'Unique names by appending smallest available suffix "(k)" when needed.',
    constraints: ['Must preserve order', 'Suffix search must avoid collisions'],
    examples: [
      {
        input: "names = ['doc','doc','image','doc(1)','doc']",
        output: "['doc','doc(1)','image','doc(1)(1)','doc(2)']",
        explanation: 'Each duplicate gets the smallest unused suffix.',
      },
    ],
    expectedApproach: 'Track used names in a set and increment suffix until an unused candidate is found.',
    commonPitfalls: ['Not handling pre-existing "(k)" names', 'Skipping minimal suffix'],
  },
  'codesignal-delete-digit': {
    signature: 'def delete_digit(n: int) -> int:',
    inputSummary: 'n: positive integer.',
    outputSummary: 'Largest integer obtainable by deleting exactly one digit.',
    constraints: ['Delete one and only one digit'],
    examples: [
      {
        input: 'n = 152',
        output: '52',
        explanation: 'Deleting 1 yields maximum value.',
      },
    ],
    expectedApproach: 'Try removing each digit and take maximum parsed value.',
    commonPitfalls: ['Not evaluating every deletion position'],
  },
  'codesignal-build-palindrome': {
    signature: 'def build_palindrome(st: str) -> str:',
    inputSummary: 'st: lowercase string.',
    outputSummary: 'Shortest palindrome by appending characters only to the end of st.',
    constraints: ['Append minimum number of chars', 'Keep original prefix unchanged'],
    examples: [
      {
        input: 'st = "abcdc"',
        output: '"abcdcba"',
        explanation: 'Append "ba" to mirror earliest prefix.',
      },
    ],
    expectedApproach: 'Find longest suffix of st that is already a palindrome, append reverse of remaining prefix.',
    commonPitfalls: ['Appending more characters than necessary'],
  },
  'codesignal-map-decoding': {
    signature: 'def map_decoding(message: str) -> int:',
    inputSummary: 'message: digit string where 1->A ... 26->Z.',
    outputSummary: 'Number of valid decodings.',
    constraints: ['0 cannot appear alone', 'Use DP to avoid exponential recursion'],
    examples: [
      {
        input: 'message = "123"',
        output: '3',
        explanation: 'Decodings: "ABC", "LC", "AW".',
      },
    ],
    expectedApproach: 'DP where dp[i] depends on valid one-digit and two-digit decodes ending at i.',
    commonPitfalls: ['Mishandling zeros', 'Invalid two-digit ranges (>26)'],
  },
  'codesignal-compose-ranges': {
    signature: 'def compose_ranges(nums: list[int]) -> list[str]:',
    inputSummary: 'nums: sorted distinct integers.',
    outputSummary: 'Range strings where consecutive sequences are compressed as "a->b".',
    constraints: ['Single values should be rendered as "x"'],
    examples: [
      {
        input: 'nums = [0, 1, 2, 4, 5, 7]',
        output: "['0->2', '4->5', '7']",
        explanation: 'Consecutive runs collapse into start->end notation.',
      },
    ],
    expectedApproach: 'Walk array once, close a range whenever continuity breaks.',
    commonPitfalls: ['Forgetting to flush final range'],
  },
  'codesignal-delivery-time': {
    signature: 'def delivery_time(n: int, roads: list[tuple[int, int, int]], start: int, target: int) -> int:',
    inputSummary: 'n nodes, weighted roads (u, v, time), start, target.',
    outputSummary: 'Shortest delivery time from start to target; return -1 if unreachable.',
    constraints: ['Weights are non-negative', 'Use Dijkstra for efficiency'],
    examples: [
      {
        input: 'n = 5, roads = [(0,1,4),(1,2,3),(0,3,10),(2,4,2),(3,4,1)], start = 0, target = 4',
        output: '9',
        explanation: 'Best path is 0->1->2->4 with total 9.',
      },
    ],
    expectedApproach: 'Build adjacency list and run Dijkstra with a min-heap.',
    commonPitfalls: ['Using BFS on weighted graph', 'Not handling disconnected nodes'],
  },
  'codesignal-feature-deployment-batches': {
    signature: 'def feature_deployment_batches(progress: list[int], speed: list[int]) -> list[int]:',
    inputSummary: 'progress: current completion %, speed: daily progress for each feature.',
    outputSummary: 'Batch sizes released together in order.',
    constraints: ['Features deploy in original order', 'Later faster feature waits for earlier unfinished feature'],
    examples: [
      {
        input: 'progress = [93, 30, 55], speed = [1, 30, 5]',
        output: '[2, 1]',
        explanation: 'First two finish by day 7; third deploys later alone.',
      },
    ],
    expectedApproach: 'Convert each feature to completion day, then group by non-decreasing release threshold.',
    commonPitfalls: ['Deploying out-of-order', 'Ceiling division mistakes'],
  },
  'neet-best-time-to-buy-and-sell-stock': {
    description:
      'Given daily stock prices, choose one day to buy and a later day to sell so profit is maximized.',
    signature: 'def best_time_to_buy_and_sell_stock(prices: list[int]) -> int:',
    inputSummary: 'prices: prices[i] is the stock price on day i.',
    outputSummary: 'Maximum profit from one buy followed by one sell; return 0 if no profit is possible.',
    constraints: [
      'You may complete at most one transaction (one buy and one sell).',
      'Sell must happen after buy.',
    ],
    examples: [
      {
        input: 'prices = [7, 1, 5, 3, 6, 4]',
        output: '5',
        explanation: 'Buy at 1 and sell at 6.',
      },
      {
        input: 'prices = [7, 6, 4, 3, 1]',
        output: '0',
        explanation: 'No profitable transaction exists.',
      },
    ],
    expectedApproach: 'Track the minimum price seen so far and best profit while scanning once.',
    commonPitfalls: ['Allowing sell before buy', 'Using O(n^2) pair checking'],
  },
  'neet-remove-nth-node-from-end-of-list': {
    description:
      'Given linked-list values and an integer n, remove the nth node from the end and return the updated list values.',
    signature: 'def remove_nth_node_from_end_of_list(values: list[int], n: int) -> list[int]:',
    inputSummary: 'values: linked-list values in order; n: 1-based position from the end to remove.',
    outputSummary: 'Updated list values after removing the nth node from the end.',
    constraints: [
      '1 <= n <= len(values)',
      'If n == len(values), remove the head value.',
    ],
    examples: [
      {
        input: 'values = [1, 2, 3, 4, 5], n = 2',
        output: '[1, 2, 3, 5]',
        explanation: 'The 2nd node from the end is 4.',
      },
      {
        input: 'values = [1], n = 1',
        output: '[]',
        explanation: 'Removing the only node yields an empty list.',
      },
    ],
    expectedApproach: 'Use a two-pointer gap of n, then remove the target in one pass.',
    commonPitfalls: ['Off-by-one gap setup', 'Not handling removal of the head node'],
  },
};

const DEFAULT_SELECTED_SET_IDS = PROBLEM_SET_REGISTRY
  .filter((s) => s.defaultSelected)
  .map((s) => s.id);

type QualityPatch = {
  addConstraints?: string[];
  addExample?: Problem['examples'][number];
};

const QUALITY_PATCHES: Record<string, QualityPatch> = {
  'codesignal-rotate-image': {
    addExample: {
      input: 'a = [[1]]',
      output: '[[1]]',
      explanation: 'A 1x1 matrix is unchanged by rotation.',
    },
  },
  'codesignal-sudoku2': {
    addExample: {
      input: "grid = ['53..7....','6..195...','.98....6.','8...6...3','4..8.3..1','7...2...6','.6....28.','...419..5','....8..79']",
      output: 'True',
      explanation: 'No digit is duplicated in any row, column, or 3x3 box.',
    },
  },
  'codesignal-is-crypt-solution': {
    addExample: {
      input: "crypt = ['A','A','B'], solution = [['A','0'],['B','0']]",
      output: 'True',
      explanation: '0 + 0 = 0 is valid for single-character words.',
    },
  },
  'codesignal-sort-by-height': {
    addConstraints: ['-1 values represent immovable trees and must remain at original indices'],
    addExample: {
      input: 'a = [-1, -1, -1]',
      output: '[-1, -1, -1]',
      explanation: 'No movable heights exist, so output is unchanged.',
    },
  },
  'codesignal-are-similar': {
    addConstraints: ['Arrays must have the same length'],
  },
  'codesignal-array-change': {
    addConstraints: ['Return the total count of +1 operations'],
    addExample: {
      input: 'input_array = [1, 2, 1]',
      output: '2',
      explanation: 'Raise final 1 to 3 with two increments.',
    },
  },
  'codesignal-avoid-obstacles': {
    addExample: {
      input: 'input_array = [1, 4, 10, 6, 2]',
      output: '7',
      explanation: 'Jump length 7 avoids all obstacle positions.',
    },
  },
  'codesignal-box-blur': {
    addExample: {
      input: 'image = [[7,4,0,1],[5,6,2,2],[6,10,7,8],[1,4,2,0]]',
      output: '[[5,4],[4,4]]',
      explanation: 'Each value is floor(sum of 3x3 window / 9).',
    },
  },
  'codesignal-minesweeper': {
    addExample: {
      input: 'matrix = [[False,False,False],[False,False,False]]',
      output: '[[0,0,0],[0,0,0]]',
      explanation: 'No mines means every adjacent-mine count is zero.',
    },
  },
  'codesignal-array-max-consecutive-sum': {
    addExample: {
      input: 'input_array = [-1, -2, -3, -4], k = 2',
      output: '-3',
      explanation: 'Best window is [-1,-2] with sum -3.',
    },
  },
  'codesignal-digits-product': {
    addConstraints: ['If product is 0, the answer is 10'],
    addExample: {
      input: 'product = 0',
      output: '10',
      explanation: '1 * 0 = 0 and 10 is the smallest such integer.',
    },
  },
  'codesignal-file-naming': {
    addExample: {
      input: "names = ['a','a','a']",
      output: "['a','a(1)','a(2)']",
      explanation: 'Suffixes increase to preserve uniqueness with minimal k.',
    },
  },
  'codesignal-delete-digit': {
    addConstraints: ['n has at least two digits'],
    addExample: {
      input: 'n = 1001',
      output: '101',
      explanation: 'Deleting one 0 yields the maximum value 101.',
    },
  },
  'codesignal-build-palindrome': {
    addExample: {
      input: 'st = "abba"',
      output: '"abba"',
      explanation: 'Already a palindrome, so no characters are appended.',
    },
  },
  'codesignal-map-decoding': {
    addExample: {
      input: 'message = "100"',
      output: '0',
      explanation: 'No valid decoding because trailing 0 cannot stand alone.',
    },
  },
  'codesignal-compose-ranges': {
    addConstraints: ['Input array is sorted and contains distinct values'],
    addExample: {
      input: 'nums = []',
      output: '[]',
      explanation: 'Empty input yields no ranges.',
    },
  },
  'codesignal-delivery-time': {
    addExample: {
      input: 'n = 3, roads = [(0,1,5)], start = 0, target = 2',
      output: '-1',
      explanation: 'Target node is unreachable from start.',
    },
  },
  'codesignal-feature-deployment-batches': {
    addExample: {
      input: 'progress = [95, 90, 99, 99, 80, 99], speed = [1, 1, 1, 1, 1, 1]',
      output: '[1, 3, 2]',
      explanation: 'Features deploy in ordered batches by completion day thresholds.',
    },
  },
  'neet-group-anagrams': {
    addExample: {
      input: 'strs = [""]',
      output: '[[""]]',
      explanation: 'A single empty string forms one anagram group.',
    },
  },
  'neet-min-stack': {
    addExample: {
      input: 'push(-2), push(0), push(-3), get_min(), pop(), top(), get_min()',
      output: '-3, 0, -2',
      explanation: 'Minimum tracking stays correct after pops.',
    },
  },
  'neet-generate-parentheses': {
    addExample: {
      input: 'n = 1',
      output: '["()"]',
      explanation: 'Only one valid combination exists for one pair.',
    },
  },
  'neet-daily-temperatures': {
    addExample: {
      input: 'temperatures = [30, 40, 50, 60]',
      output: '[1, 1, 1, 0]',
      explanation: 'Each day waits one day except the last.',
    },
  },
  'neet-car-fleet': {
    addExample: {
      input: 'target = 10, position = [6, 8], speed = [3, 2]',
      output: '2',
      explanation: 'Cars reach target separately and never merge into one fleet.',
    },
  },
  'neet-time-based-key-value-store': {
    addExample: {
      input: 'set("foo","bar",1), get("foo",0)',
      output: '""',
      explanation: 'No timestamp <= 0 exists for key "foo".',
    },
  },
  'neet-copy-list-with-random-pointer': {
    addExample: {
      input: 'values = [], random = []',
      output: '([], [])',
      explanation: 'Empty structure should deep-copy to empty output.',
    },
  },
  'neet-lru-cache': {
    addExample: {
      input: 'capacity=2, put(2,1), put(2,2), get(2), put(1,1), put(4,1), get(2)',
      output: '2, -1',
      explanation: 'Updating a key refreshes recency before later eviction.',
    },
  },
  'neet-invert-binary-tree': {
    addExample: {
      input: 'root = []',
      output: '[]',
      explanation: 'Empty tree remains empty.',
    },
  },
  'neet-diameter-of-binary-tree': {
    addExample: {
      input: 'root = [1,2]',
      output: '1',
      explanation: 'Longest path has one edge between nodes 1 and 2.',
    },
  },
};

const APPROACH_KEYWORD_RULES: Array<{ keyword: string; patterns: string[] }> = [
  { keyword: 'hash-map', patterns: ['hash', 'dictionary', 'dict', 'map'] },
  { keyword: 'set', patterns: [' set', 'hash set'] },
  { keyword: 'two-pointers', patterns: ['two pointer', 'two-pointer'] },
  { keyword: 'sliding-window', patterns: ['sliding window'] },
  { keyword: 'stack', patterns: ['stack', 'lifo'] },
  { keyword: 'binary-search', patterns: ['binary search'] },
  { keyword: 'dfs', patterns: ['dfs', 'depth first'] },
  { keyword: 'bfs', patterns: ['bfs', 'breadth first', 'queue'] },
  { keyword: 'dynamic-programming', patterns: ['dynamic programming', 'dp', 'memo'] },
  { keyword: 'sorting', patterns: ['sort', 'sorted'] },
  { keyword: 'heap', patterns: ['heap', 'priority queue'] },
  { keyword: 'prefix-suffix', patterns: ['prefix', 'suffix'] },
];

function normalizeDifficulty(value: unknown): Difficulty {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value;
  return 'medium';
}

function normalizeLanguage(value: unknown, assessmentType: AssessmentType): ProgrammingLanguage {
  if (
    value === 'python' ||
    value === 'javascript' ||
    value === 'typescript' ||
    value === 'sql' ||
    value === 'yaml' ||
    value === 'dockerfile'
  ) {
    return value;
  }
  return assessmentType === 'coding' ? 'python' : 'python';
}

function defaultScaffold(assessmentType: AssessmentType): string {
  if (assessmentType === 'coding') {
    return 'def solution(data):\n    # Implement your solution\n    pass';
  }
  return '# Write your answer here.\n# Explain your reasoning clearly.';
}

function nonCodingScaffold(language: ProgrammingLanguage): string {
  const commentPrefix =
    language === 'javascript' || language === 'typescript'
      ? '//'
      : language === 'sql'
        ? '--'
        : '#';
  return `${commentPrefix} Write your answer here.\n${commentPrefix} Explain your reasoning clearly.`;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function toExamples(value: unknown): Problem['examples'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => entry as Problem['examples'][number])
    .filter(
      (entry) =>
        typeof entry === 'object' &&
        typeof entry?.input === 'string' &&
        typeof entry?.output === 'string'
    );
}

function parseSummaryFromPrompt(prompt: string, title: string): string {
  const structured = prompt.match(/^Solve\s+"[^"]+"\.\s*\n\s*\n([\s\S]*?)\n\s*\nExpectations:/);
  if (structured?.[1]) {
    return structured[1].trim();
  }

  const paragraphs = prompt
    .split(/\n\s*\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) {
    return paragraphs[1];
  }
  return `Solve ${title}.`;
}

function isPlaceholderExample(example: Problem['examples'][number] | undefined): boolean {
  if (!example) return true;
  const input = example.input.toLowerCase();
  const output = example.output.toLowerCase();
  return input.includes('representative sample') || output.includes('correct output for that sample');
}

function isLowSignalCodingProblem(
  raw: RawProblem,
  constraints: string[],
  examples: Problem['examples']
): boolean {
  const prompt = raw.prompt ?? '';
  const hasTemplatePrompt = prompt.startsWith('Solve "') && prompt.includes('Expectations:');
  const hasTemplateConstraints =
    constraints.length === 0 ||
    (constraints.length <= 2 &&
      constraints.some((c) => c.toLowerCase().includes('efficient enough for production interview constraints')));
  const hasTemplateExamples = examples.length === 0 || isPlaceholderExample(examples[0]);

  return hasTemplatePrompt || hasTemplateConstraints || hasTemplateExamples;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function applyQualityPatchConstraints(problemId: string, constraints: string[]): string[] {
  const patch = QUALITY_PATCHES[problemId];
  if (!patch?.addConstraints || patch.addConstraints.length === 0) return constraints;
  return dedupeStrings([...constraints, ...patch.addConstraints]);
}

function applyQualityPatchExamples(problemId: string, examples: Problem['examples']): Problem['examples'] {
  const patch = QUALITY_PATCHES[problemId];
  if (!patch?.addExample) return examples;

  const exists = examples.some(
    (example) =>
      example.input.trim().toLowerCase() === patch.addExample!.input.trim().toLowerCase() &&
      example.output.trim().toLowerCase() === patch.addExample!.output.trim().toLowerCase()
  );

  if (exists) return examples;
  return [...examples, patch.addExample];
}

function ensureCodingExamples(problemId: string, title: string, examples: Problem['examples']): Problem['examples'] {
  const patched = applyQualityPatchExamples(problemId, examples);
  if (patched.length > 0) return patched;

  // Fail-closed behavior handles missing examples for coding problems.
  console.warn(`[ProblemService] Missing curated examples for coding problem: ${problemId} (${title})`);
  return [];
}

function extractFunctionSignature(scaffold: string): string | undefined {
  if (!scaffold) return undefined;
  return scaffold
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('def ') || line.startsWith('class ') || line.startsWith('function '));
}

function inferComplexityTarget(
  constraints: string[],
  expectedApproach: string
): 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n^2)' | undefined {
  const joined = `${constraints.join(' ')} ${expectedApproach}`.toLowerCase();
  if (joined.includes('o(log n)')) return 'O(log n)';
  if (joined.includes('o(n log n)')) return 'O(n log n)';
  if (joined.includes('o(n^2)') || joined.includes('o(n²)')) return 'O(n^2)';
  if (joined.includes('o(1)')) return 'O(1)';
  if (joined.includes('o(n)') || joined.includes('linear')) return 'O(n)';
  return undefined;
}

function inferApproachKeywords(expectedApproach: string, prompt: string): string[] {
  const text = `${expectedApproach} ${prompt}`.toLowerCase();
  return APPROACH_KEYWORD_RULES
    .filter((rule) => rule.patterns.some((pattern) => text.includes(pattern)))
    .map((rule) => rule.keyword);
}

function buildTutorPlan(
  _problem: RawProblem,
  assessmentType: AssessmentType,
  prompt: string,
  constraints: string[],
  scaffold: string,
  expectedApproach: string,
  commonPitfalls: string[]
): NonNullable<Problem['tutorPlan']> {
  const signature = extractFunctionSignature(scaffold);
  const firstConstraint = constraints[0] ?? 'Clarify assumptions and boundary cases.';
  const firstPitfall = commonPitfalls[0] ?? 'State assumptions before implementation.';
  const secondPitfall = commonPitfalls[1] ?? 'Validate edge cases explicitly.';

  if (assessmentType !== 'coding') {
    return {
      openingPrompt:
        assessmentType === 'behavioral'
          ? 'What story will you use, and what measurable result will you emphasize? Any clear format is fine.'
          : assessmentType === 'math'
            ? 'What assumptions and formulas will you use first?'
            : 'What requirements and tradeoffs will you prioritize first?',
      clarifications: [
        {
          triggers: ['format', 'structure', 'how should i answer', 'template', 'star'],
          response: 'Any clear format is acceptable (including a paragraph). STAR is optional if it helps you organize your answer.',
        },
        {
          triggers: ['stuck', 'help', 'hint'],
          response: `Start with one concrete context sentence, then your decision, then outcome. STAR is optional. Constraint reminder: ${firstConstraint}`,
        },
      ],
      hintLadder: [
        { level: 1, hint: 'Start by restating the problem in one sentence and naming your approach.' },
        { level: 2, hint: 'List the top 2-3 factors or tradeoffs that drive your decision.' },
        { level: 3, hint: 'Provide one concrete example or metric to support your recommendation.' },
        { level: 4, hint: 'Close with a concise conclusion and one follow-up action.' },
      ],
      selfCheckPrompts: [
        'What part of your response is strongest right now?',
        'Which requirement have you not addressed yet?',
        'Can you add one concrete metric or outcome?',
      ],
      nudgeRules: [
        {
          id: 'missing-structure',
          when: 'missing-structure',
          message: 'Quick reset: structure your response into context, approach, and outcome so it is easy to evaluate.',
          cooldownSeconds: 90,
        },
      ],
      approachKeywords: ['structure', 'tradeoffs', 'outcome'],
      llmPolicy: {
        localFirst: true,
        maxDeterministicTurns: 6,
      },
    };
  }

  const approachKeywords = inferApproachKeywords(expectedApproach, prompt);
  const complexityTarget = inferComplexityTarget(constraints, expectedApproach);
  const inputSummary = signature
    ? `Use this contract exactly: ${signature}`
    : 'Use the function signature shown in the editor as the source of truth.';

  return {
    openingPrompt: 'What approach are you considering first, and what complexity are you aiming for?',
    clarifications: [
      {
        triggers: ['input', 'parameter', 'argument', 'format', 'variable', 'data'],
        response: inputSummary,
      },
      {
        triggers: ['output', 'return'],
        response: 'Match the exact return type required by the function signature and examples.',
      },
      {
        triggers: ['complexity', 'big o'],
        response: complexityTarget
          ? `Target complexity for this prompt: ${complexityTarget}.`
          : `Use the constraint hints to justify your complexity choice. (${firstConstraint})`,
      },
    ],
    hintLadder: [
      { level: 1, hint: 'Restate input/output in your own words before coding.' },
      { level: 2, hint: expectedApproach || 'Choose one data structure and explain why it fits.' },
      { level: 3, hint: `Edge-case checkpoint: ${firstPitfall}` },
      { level: 4, hint: `Before submitting, verify complexity and this pitfall: ${secondPitfall}` },
    ],
    selfCheckPrompts: [
      'Does your code satisfy the exact function contract?',
      complexityTarget
        ? `Can you justify ${complexityTarget} (or better) complexity for your implementation?`
        : 'Can you clearly justify your time and space complexity?',
      'Which edge case could still break your current solution?',
    ],
    nudgeRules: [
      {
        id: 'no-progress',
        when: 'no-progress',
        message: 'You are still close to scaffold-only. Pause and outline a 3-step plan before writing more code.',
        cooldownSeconds: 90,
      },
      {
        id: 'likely-inefficient',
        when: 'likely-inefficient',
        message: 'Your current draft may be more expensive than needed. Re-check constraints and consider a more direct data-structure approach.',
        cooldownSeconds: 120,
      },
    ],
    approachKeywords,
    complexityTarget,
    llmPolicy: {
      localFirst: true,
      maxDeterministicTurns: 8,
    },
  };
}

function buildCodingPrompt(
  title: string,
  summary: string,
  override: CodingProblemOverride
): string {
  const description = override.description?.trim().length
    ? override.description.trim()
    : summary.trim().length > 0
      ? summary.trim()
      : `Solve ${title}.`;

  return `${description}
Implement the function below.

Function to implement (Python):
${override.signature}

Input:
- ${override.inputSummary}

Output:
- ${override.outputSummary}`;
}

function buildCodingScaffold(override: CodingProblemOverride): string {
  return `${override.signature}
    pass`;
}

function normalizeProblem(raw: RawProblem, setMeta: Omit<ProblemSetOption, 'questionCount'>): Problem | null {
  const assessmentType = (raw.assessmentType ?? setMeta.assessmentType) as AssessmentType;
  const language = normalizeLanguage(raw.language, assessmentType);
  const constraints = toStringArray(raw.constraints);
  const examples = toExamples(raw.examples);
  const summary = parseSummaryFromPrompt(raw.prompt, raw.title);
  const lowSignalCoding = assessmentType === 'coding' && isLowSignalCodingProblem(raw, constraints, examples);
  const codingOverride =
    assessmentType === 'coding'
      ? CODING_PROBLEM_OVERRIDES[raw.id]
      : null;

  // Fail closed for coding prompts: never ship generic inferred contracts/prompts.
  if (assessmentType === 'coding' && lowSignalCoding && !codingOverride) {
    console.warn(`[ProblemService] Skipping low-signal coding problem without curated contract: ${raw.id}`);
    return null;
  }

  const scaffold =
    assessmentType === 'coding'
      ? (lowSignalCoding
        ? buildCodingScaffold(codingOverride!)
        : (typeof raw.scaffold === 'string' && raw.scaffold.trim().length > 0
          ? raw.scaffold
          : defaultScaffold(assessmentType)))
      : (typeof raw.scaffold === 'string' && raw.scaffold.trim().length > 0
        ? raw.scaffold
        : nonCodingScaffold(language));

  const baseConstraints =
    lowSignalCoding
      ? codingOverride!.constraints
      : (constraints.length > 0 ? constraints : ['Clarify assumptions and explain edge-case handling.']);

  const baseExamples =
    lowSignalCoding
      ? codingOverride!.examples
      : (examples.length > 0
        ? examples
        : []);

  const expectedApproach =
    lowSignalCoding
      ? codingOverride!.expectedApproach
      : (typeof raw.expectedApproach === 'string' && raw.expectedApproach.trim().length > 0
        ? raw.expectedApproach
        : 'State assumptions, present a structured approach, and justify tradeoffs.');

  const commonPitfalls =
    lowSignalCoding
      ? codingOverride!.commonPitfalls
      : (toStringArray(raw.commonPitfalls).length > 0
        ? toStringArray(raw.commonPitfalls)
        : ['Unclear assumptions', 'Incomplete edge-case coverage', 'Weak communication of tradeoffs']);

  const prompt = (lowSignalCoding ? buildCodingPrompt(raw.title, summary, codingOverride!) : raw.prompt).trim();

  let normalizedConstraints =
    assessmentType === 'coding'
      ? applyQualityPatchConstraints(raw.id, baseConstraints)
      : baseConstraints;

  if (assessmentType === 'coding' && normalizedConstraints.length < 3) {
    normalizedConstraints = dedupeStrings([
      ...normalizedConstraints,
      'Handle boundary cases explicitly (empty/single-element/min/max constraints).',
      'Match the exact input/output contract shown by the function signature.',
    ]);
  }

  let normalizedExamples =
    assessmentType === 'coding'
      ? ensureCodingExamples(raw.id, raw.title, baseExamples)
      : applyQualityPatchExamples(raw.id, baseExamples);

  const signature = extractFunctionSignature(scaffold);
  const requiresFunctionSignature =
    assessmentType === 'coding' &&
    (language === 'python' || language === 'javascript' || language === 'typescript');

  if (assessmentType === 'coding') {
    const hasValidExample = normalizedExamples.length > 0 && !isPlaceholderExample(normalizedExamples[0]);
    if ((!signature && requiresFunctionSignature) || !hasValidExample) {
      console.warn(
        `[ProblemService] Skipping coding problem with incomplete contract/examples: ${raw.id}`
      );
      return null;
    }
  }

  const contract: NonNullable<Problem['contract']> = {
    responseMode: assessmentType === 'coding' ? 'code' : 'narrative',
    starterTemplate: scaffold,
    functionSignature: signature,
    inputSummary: normalizedExamples[0]?.input,
    outputSummary: normalizedExamples[0]?.output,
  };

  const content: NonNullable<Problem['content']> = {
    description: prompt,
    constraints: normalizedConstraints,
    examples: normalizedExamples,
  };

  const tutorPlan = buildTutorPlan(
    raw,
    assessmentType,
    prompt,
    normalizedConstraints,
    scaffold,
    expectedApproach,
    commonPitfalls
  );

  return {
    id: raw.id,
    title: raw.title,
    prompt,
    language,
    difficulty: normalizeDifficulty(raw.difficulty),
    timeLimit: typeof raw.timeLimit === 'number' && raw.timeLimit > 0 ? raw.timeLimit : 20,
    constraints: normalizedConstraints,
    scaffold,
    examples: normalizedExamples,
    expectedApproach,
    commonPitfalls,
    idealSolutionOutline:
      typeof raw.idealSolutionOutline === 'string' && raw.idealSolutionOutline.trim().length > 0
        ? raw.idealSolutionOutline
        : 'Summarize optimal reasoning, steps, and validation checks.',
    evaluationNotes:
      typeof raw.evaluationNotes === 'string' && raw.evaluationNotes.trim().length > 0
        ? raw.evaluationNotes
        : 'Evaluate correctness, rigor, and communication quality.',
    assessmentType,
    domain: typeof raw.domain === 'string' && raw.domain.trim().length > 0 ? raw.domain : setMeta.domain,
    competencyTags: Array.isArray(raw.competencyTags)
      ? raw.competencyTags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : undefined,
    problemSetId: setMeta.id,
    content,
    contract,
    tutorPlan,
  };
}

class ProblemService implements ProblemServiceInterface {
  private problems: Problem[] = [];
  private isLoaded = false;
  private selectedSetIds: string[] = [...DEFAULT_SELECTED_SET_IDS];
  private allProblemsBySet: Record<string, Problem[]> = {};

  constructor() {
    this.allProblemsBySet = Object.fromEntries(
      PROBLEM_SET_REGISTRY.map((setMeta) => {
        const raw = RAW_PROBLEMS_BY_SET[setMeta.id] ?? [];
        return [setMeta.id, raw.map((p) => normalizeProblem(p, setMeta)).filter((p): p is Problem => p !== null)];
      }),
    );
    this.applySelection(this.selectedSetIds);
  }

  private sanitizeSetSelection(problemSetIds?: string[]): string[] {
    const allIds = new Set(PROBLEM_SET_REGISTRY.map((s) => s.id));
    const requested = (problemSetIds ?? [])
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => allIds.has(id));

    if (requested.length > 0) return Array.from(new Set(requested));
    return [...DEFAULT_SELECTED_SET_IDS];
  }

  private applySelection(problemSetIds?: string[]): Problem[] {
    const selected = this.sanitizeSetSelection(problemSetIds);
    this.selectedSetIds = selected;
    this.problems = selected.flatMap((setId) => this.allProblemsBySet[setId] ?? []);
    this.isLoaded = true;
    return this.problems;
  }

  async loadProblems(problemSetIds?: string[]): Promise<Problem[]> {
    return this.applySelection(problemSetIds);
  }

  getAvailableProblemSets(): ProblemSetOption[] {
    return PROBLEM_SET_REGISTRY.map((meta) => ({
      ...meta,
      questionCount: (this.allProblemsBySet[meta.id] ?? []).length,
    }));
  }

  getRandomProblem(excludeIds?: string[]): Problem {
    if (!this.isLoaded || this.problems.length === 0) {
      this.applySelection(this.selectedSetIds);
    }

    if (this.problems.length === 0) {
      throw new Error('No problems available in selected sets');
    }

    if (!excludeIds || excludeIds.length === 0) {
      const randomIndex = Math.floor(Math.random() * this.problems.length);
      return this.problems[randomIndex];
    }

    const excludeSet = new Set(excludeIds);
    const availableProblems = this.problems.filter((problem) => !excludeSet.has(problem.id));

    if (availableProblems.length === 0) {
      const randomIndex = Math.floor(Math.random() * this.problems.length);
      return this.problems[randomIndex];
    }

    const randomIndex = Math.floor(Math.random() * availableProblems.length);
    return availableProblems[randomIndex];
  }

  getProblemById(id: string): Problem | null {
    if (!this.isLoaded || this.problems.length === 0) {
      this.applySelection(this.selectedSetIds);
    }

    const problem = this.problems.find((p) => p.id === id);
    return problem ?? null;
  }
}

export const problemService = new ProblemService();
export { ProblemService };
