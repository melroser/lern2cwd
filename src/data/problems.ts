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

/**
 * Starter problems for the coding interview simulator
 */
export const problems: Problem[] = [
  {
    id: 'fizzbuzz',
    language: 'python',
    title: 'FizzBuzz',
    difficulty: 'easy',
    timeLimit: 10,
    prompt: `Write a function that takes a positive integer n and returns a list of strings representing the numbers from 1 to n with the following rules:

- For multiples of 3, use "Fizz" instead of the number
- For multiples of 5, use "Buzz" instead of the number
- For multiples of both 3 and 5, use "FizzBuzz" instead of the number
- For all other numbers, use the string representation of the number

Return the result as a list of strings.`,
    constraints: [
      '1 <= n <= 10000',
      'n is always a positive integer'
    ],
    scaffold: `def fizz_buzz(n: int) -> list[str]:
    # Your code here
    pass`,
    examples: [
      {
        input: 'n = 15',
        output: '["1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz", "11", "Fizz", "13", "14", "FizzBuzz"]',
        explanation: 'Numbers divisible by 3 become "Fizz", by 5 become "Buzz", by both become "FizzBuzz"'
      },
      {
        input: 'n = 5',
        output: '["1", "2", "Fizz", "4", "Buzz"]',
        explanation: '3 is divisible by 3, 5 is divisible by 5'
      }
    ],
    expectedApproach: 'Loop through 1 to n, check divisibility using modulo operator. Check for divisibility by 15 (or both 3 and 5) first, then 3, then 5.',
    commonPitfalls: [
      'Order of checks matters - must check for 15 (or both 3 and 5) before checking 3 or 5 individually',
      'Off-by-one errors - should include both 1 and n',
      'Returning numbers instead of strings',
      'Using if-elif incorrectly causing multiple conditions to match'
    ],
    idealSolutionOutline: 'for i in range(1, n+1), check i % 15 == 0 first (or i % 3 == 0 and i % 5 == 0), then i % 3 == 0, then i % 5 == 0, else append str(i)',
    evaluationNotes: 'Look for understanding of modulo operator and proper ordering of conditional checks. Accept solutions that check (i % 3 == 0 and i % 5 == 0) instead of i % 15 == 0.'
  },
  {
    id: 'two-sum',
    language: 'python',
    title: 'Two Sum',
    difficulty: 'easy',
    timeLimit: 15,
    prompt: `Given a list of integers nums and an integer target, return the indices of the two numbers that add up to target.

You may assume that each input has exactly one solution, and you may not use the same element twice.

You can return the answer in any order.`,
    constraints: [
      '2 <= len(nums) <= 10000',
      '-10^9 <= nums[i] <= 10^9',
      '-10^9 <= target <= 10^9',
      'Only one valid answer exists',
      'You may not use the same element twice'
    ],
    scaffold: `def two_sum(nums: list[int], target: int) -> list[int]:
    # Your code here
    pass`,
    examples: [
      {
        input: 'nums = [2, 7, 11, 15], target = 9',
        output: '[0, 1]',
        explanation: 'nums[0] + nums[1] = 2 + 7 = 9, so we return [0, 1]'
      },
      {
        input: 'nums = [3, 2, 4], target = 6',
        output: '[1, 2]',
        explanation: 'nums[1] + nums[2] = 2 + 4 = 6'
      },
      {
        input: 'nums = [3, 3], target = 6',
        output: '[0, 1]',
        explanation: 'nums[0] + nums[1] = 3 + 3 = 6'
      }
    ],
    expectedApproach: 'Use a dictionary to store seen numbers and their indices. For each number, check if (target - current) exists in the dict.',
    commonPitfalls: [
      'Using O(n²) brute force instead of O(n) dictionary approach',
      'Using the same element twice (checking if complement equals current index)',
      'Not handling negative numbers correctly',
      'Returning values instead of indices'
    ],
    idealSolutionOutline: 'Create empty dict seen = {}. Loop with enumerate: for i, num in enumerate(nums). Calculate complement = target - num. If complement in seen, return [seen[complement], i]. Otherwise, seen[num] = i.',
    evaluationNotes: 'Optimal solution uses dictionary for O(n) time complexity. Accept O(n²) brute force but note the suboptimal complexity. Look for proper handling of the constraint about not using the same element twice.'
  },
  {
    id: 'valid-parentheses',
    language: 'python',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    timeLimit: 15,
    prompt: `Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.`,
    constraints: [
      '1 <= len(s) <= 10000',
      's consists of parentheses only: ()[]{}'
    ],
    scaffold: `def is_valid(s: str) -> bool:
    # Your code here
    pass`,
    examples: [
      {
        input: 's = "()"',
        output: 'True',
        explanation: 'Single pair of matching parentheses'
      },
      {
        input: 's = "()[]{}"',
        output: 'True',
        explanation: 'Three pairs of matching brackets in sequence'
      },
      {
        input: 's = "(]"',
        output: 'False',
        explanation: 'Opening ( does not match closing ]'
      },
      {
        input: 's = "([)]"',
        output: 'False',
        explanation: 'Brackets are not closed in the correct order'
      },
      {
        input: 's = "{[]}"',
        output: 'True',
        explanation: 'Nested brackets are properly matched'
      }
    ],
    expectedApproach: 'Use a stack (list). Push opening brackets onto stack, pop and compare when encountering closing brackets.',
    commonPitfalls: [
      'Not using a stack (trying to count brackets instead)',
      'Forgetting to check if stack is empty before popping',
      'Not checking if stack is empty at the end (unmatched opening brackets)',
      'Incorrect bracket matching logic'
    ],
    idealSolutionOutline: 'Create empty stack = [] and bracket map closing_to_opening = {")":"(", "]":"[", "}":"{"}. Loop through s: if char in closing_to_opening.values(), append to stack. If char in closing_to_opening, check stack and top matches, then pop. Return len(stack) == 0.',
    evaluationNotes: 'Look for proper use of stack data structure. The key insight is LIFO ordering matches the nesting requirement. Accept list used as stack with append/pop.'
  },
  {
    id: 'reverse-string',
    language: 'python',
    title: 'Reverse String',
    difficulty: 'easy',
    timeLimit: 10,
    prompt: `Write a function that reverses a list of characters in-place.

You must do this by modifying the input list in-place with O(1) extra memory. Do not return a new list.`,
    constraints: [
      '1 <= len(s) <= 100000',
      's[i] is a printable ASCII character'
    ],
    scaffold: `def reverse_string(s: list[str]) -> None:
    # Your code here - modify s in-place
    pass`,
    examples: [
      {
        input: 's = ["h", "e", "l", "l", "o"]',
        output: '["o", "l", "l", "e", "h"]',
        explanation: 'The list is reversed in place'
      },
      {
        input: 's = ["H", "a", "n", "n", "a", "h"]',
        output: '["h", "a", "n", "n", "a", "H"]',
        explanation: 'Palindrome-like input still gets reversed'
      }
    ],
    expectedApproach: 'Two-pointer technique: one pointer at start, one at end. Swap characters and move pointers toward center.',
    commonPitfalls: [
      'Creating a new list instead of modifying in-place',
      'Using s.reverse() or s[::-1] which may not demonstrate understanding',
      'Off-by-one errors with pointer boundaries',
      'Not handling odd-length lists correctly (middle element)'
    ],
    idealSolutionOutline: 'Initialize left = 0, right = len(s) - 1. While left < right: swap s[left], s[right] = s[right], s[left], then left += 1, right -= 1.',
    evaluationNotes: 'Look for understanding of two-pointer technique and in-place modification. Using s.reverse() is acceptable but discuss the underlying algorithm.'
  },
  {
    id: 'palindrome-number',
    language: 'python',
    title: 'Palindrome Number',
    difficulty: 'easy',
    timeLimit: 10,
    prompt: `Given an integer x, return True if x is a palindrome, and False otherwise.

A palindrome is a number that reads the same backward as forward.

Follow-up: Could you solve it without converting the integer to a string?`,
    constraints: [
      '-2^31 <= x <= 2^31 - 1'
    ],
    scaffold: `def is_palindrome(x: int) -> bool:
    # Your code here
    pass`,
    examples: [
      {
        input: 'x = 121',
        output: 'True',
        explanation: '121 reads as 121 from left to right and from right to left'
      },
      {
        input: 'x = -121',
        output: 'False',
        explanation: 'From left to right, it reads -121. From right to left, it becomes 121-. Therefore it is not a palindrome.'
      },
      {
        input: 'x = 10',
        output: 'False',
        explanation: 'Reads 01 from right to left. Therefore it is not a palindrome.'
      }
    ],
    expectedApproach: 'Either convert to string and compare with reverse, or reverse the number mathematically by extracting digits.',
    commonPitfalls: [
      'Not handling negative numbers (they are never palindromes)',
      'Integer overflow when reversing large numbers (less of an issue in Python)',
      'Not handling numbers ending in 0 correctly (except 0 itself)',
      'Off-by-one errors when comparing digits'
    ],
    idealSolutionOutline: 'If x < 0, return False. String approach: return str(x) == str(x)[::-1]. Math approach: reverse half the number, compare with other half.',
    evaluationNotes: 'Both string and mathematical approaches are valid. The mathematical approach shows deeper understanding. Look for proper handling of negative numbers and edge cases like 0 and numbers ending in 0.'
  }
];

/**
 * Export the problems array as default for convenience
 */
export default problems;
