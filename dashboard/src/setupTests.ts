import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for jsdom environment
Object.assign(global, { TextEncoder, TextDecoder });
