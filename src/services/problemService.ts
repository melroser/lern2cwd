/**
 * ProblemService - Manages the problem bank for the Coding Interview Simulator
 * 
 * Requirements: 8.3, 8.4
 * - 8.3: THE System SHALL load problems from the Problem_Bank for each Assessment_Session
 * - 8.4: WHEN the user clicks "Next problem", THE System SHALL load a new problem from the Problem_Bank
 */

import type { Problem, ProblemServiceInterface } from '../types';
import { problems } from '../data/problems';

/**
 * ProblemService implementation
 * 
 * Manages loading and retrieving problems from the problem bank.
 * Supports random problem selection with exclusion list for "Next problem" functionality.
 */
class ProblemService implements ProblemServiceInterface {
  private problems: Problem[] = [];
  private isLoaded: boolean = false;

  /**
   * Load all problems from the problem bank
   * 
   * Requirements: 8.3 - Load problems from the Problem_Bank for each Assessment_Session
   * 
   * @returns Promise resolving to array of all problems
   */
  async loadProblems(): Promise<Problem[]> {
    // In a real application, this might fetch from an API
    // For now, we load from the static problems data
    this.problems = [...problems];
    this.isLoaded = true;
    return this.problems;
  }

  /**
   * Get a random problem, optionally excluding certain problem IDs
   * 
   * Requirements: 8.4 - Load a new problem from the Problem_Bank when user clicks "Next problem"
   * 
   * Property 9: Next Problem Uniqueness
   * - For any call with an exclusion list, the returned problem's id SHALL NOT be in the exclusion list
   *   (when multiple problems exist and not all are excluded)
   * 
   * @param excludeIds - Optional array of problem IDs to exclude from selection
   * @returns A random problem not in the exclusion list, or any random problem if all are excluded
   */
  getRandomProblem(excludeIds?: string[]): Problem {
    // Ensure problems are loaded
    if (!this.isLoaded || this.problems.length === 0) {
      // Load synchronously from static data as fallback
      this.problems = [...problems];
      this.isLoaded = true;
    }

    // If no exclusion list provided, return any random problem
    if (!excludeIds || excludeIds.length === 0) {
      const randomIndex = Math.floor(Math.random() * this.problems.length);
      return this.problems[randomIndex];
    }

    // Create a set for O(1) lookup of excluded IDs
    const excludeSet = new Set(excludeIds);

    // Filter out excluded problems
    const availableProblems = this.problems.filter(
      (problem) => !excludeSet.has(problem.id)
    );

    // If all problems are excluded, return any random problem
    // This handles the edge case where the user has completed all problems
    if (availableProblems.length === 0) {
      const randomIndex = Math.floor(Math.random() * this.problems.length);
      return this.problems[randomIndex];
    }

    // Return a random problem from the available (non-excluded) problems
    const randomIndex = Math.floor(Math.random() * availableProblems.length);
    return availableProblems[randomIndex];
  }

  /**
   * Get a specific problem by its ID
   * 
   * @param id - The problem ID to look up
   * @returns The problem with the given ID, or null if not found
   */
  getProblemById(id: string): Problem | null {
    // Ensure problems are loaded
    if (!this.isLoaded || this.problems.length === 0) {
      // Load synchronously from static data as fallback
      this.problems = [...problems];
      this.isLoaded = true;
    }

    const problem = this.problems.find((p) => p.id === id);
    return problem ?? null;
  }
}

// Export a singleton instance for use throughout the application
export const problemService = new ProblemService();

// Also export the class for testing purposes
export { ProblemService };
