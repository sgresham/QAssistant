import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Login from '../components/Login';

vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: vi.fn(() => vi.fn()),
}));

describe('Login', () => {
  const onLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login heading by default', () => {
    render(<Login onLogin={onLogin} />);
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('renders email and password inputs', () => {
    render(<Login onLogin={onLogin} />);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
  });

  it('switches to register mode when clicking register link', () => {
    render(<Login onLogin={onLogin} />);
    fireEvent.click(screen.getByText('Register here'));
    expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
  });

  it('switches back to login mode', () => {
    render(<Login onLogin={onLogin} />);
    fireEvent.click(screen.getByText('Register here'));
    fireEvent.click(screen.getByText('Login here'));
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('submits login form and shows error on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    });

    render(<Login onLogin={onLogin} />);

    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    fireEvent.change(emailInput, { target: { value: 'test@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    const errorMsg = await screen.findByText('Invalid credentials', {}, { timeout: 3000 });
    expect(errorMsg).toBeInTheDocument();
  });

  it('submits login form and calls onLogin on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        token: 'test-token',
        user: { id: '1', email: 'test@test.com' },
      }),
    });

    render(<Login onLogin={onLogin} />);

    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    fireEvent.change(emailInput, { target: { value: 'test@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'correct' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await screen.findByRole('heading', { name: 'Login' });
    expect(onLogin).toHaveBeenCalledWith(
      { id: '1', email: 'test@test.com' },
      'test-token'
    );
  });

  it('shows Google sign-in button', () => {
    render(<Login onLogin={onLogin} />);
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });

  it('clears error when toggling mode', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    });

    render(<Login onLogin={onLogin} />);

    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    fireEvent.change(emailInput, { target: { value: 'test@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await screen.findByText('Invalid credentials', {}, { timeout: 3000 });
    fireEvent.click(screen.getByText('Register here'));
    expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
  });
});
