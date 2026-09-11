/* eslint-env jest */
const mockStorage = {};
const mockAsyncStorage = {
  setItem: jest.fn((key, value) => {
    mockStorage[key] = value;
    return Promise.resolve(null);
  }),
  getItem: jest.fn((key) => {
    return Promise.resolve(mockStorage[key] || null);
  }),
  removeItem: jest.fn((key) => {
    delete mockStorage[key];
    return Promise.resolve(null);
  }),
  clear: jest.fn(() => {
    for (const key in mockStorage) delete mockStorage[key];
    return Promise.resolve(null);
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStorage))),
};

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
