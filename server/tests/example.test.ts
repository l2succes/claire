describe('Server Test Suite', () => {
  it('should pass a basic test', () => {
    expect(true).toBe(true);
  });

  it('should have test utilities available', () => {
    const mockUser = (global as any).testUtils.generateMockUser();
    expect(mockUser).toHaveProperty('id');
    expect(mockUser).toHaveProperty('email');
  });
});