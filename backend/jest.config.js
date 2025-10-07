// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'services/**/*.ts',
    'utils/**/*.ts',
    '!**/*.d.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapping: {
    '^../(.*)$': '<rootDir>/$1'
  },
  testTimeout: 10000,
  verbose: true
};
