/**
 * Vitest setup file
 * Configures the test environment with necessary globals and mocks
 */

import { afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Create a localStorage mock for testing
class LocalStorageMock {
  private store: Record<string, string> = {};

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] ?? null;
  }

  get length(): number {
    return Object.keys(this.store).length;
  }
}

// Set up localStorage mock before each test
const localStorageMock = new LocalStorageMock();

beforeEach(() => {
  // Clear localStorage before each test
  localStorageMock.clear();
  
  // Assign to global
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });

  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverMock,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: () => {},
    writable: true,
    configurable: true,
  });
});

// Clean up localStorage after each test
afterEach(() => {
  localStorageMock.clear();
});
