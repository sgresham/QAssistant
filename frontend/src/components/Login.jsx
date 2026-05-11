import { useState } from 'react';
import axios from 'axios';
import { useGoogleLogin } from '@react-oauth/google';

// Determine API URL dynamically based on environment variables
const isHttps = import.meta.env.VITE_HTTPS_ENABLED === 'true';
const apiIp = import.meta.env.VITE_API_IP || 'localhost';
const apiPort = import.meta.env.VITE_API_PORT || '3001';
const API_URL = `api`;

function Login({ onLogin }) {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let response;
      if (isLoginMode) {
        response = await axios.post(`${API_URL}/auth/login`, { email, password });
      } else {
        response = await axios.post(`${API_URL}/auth/register`, { email, password });
      }

      const { token, user } = response.data;

      // Store token and user info
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      // Notify parent to update auth state
      onLogin(user, token);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'An unexpected error occurred';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setError('');
      setLoading(true);
      try {
        // codeResponse.code is a one-time use authorization code
        const response = await axios.post(`${API_URL}/auth/google`, {
          code: codeResponse.code
        });

        const { token, user } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        onLogin(user, token);
      } catch (err) {
        setError(err.response?.data?.error || 'Google login failed');
      } finally {
        setLoading(false);
      }
    },
    flow: 'auth-code',
    // Add the scopes the Taylor Wilsdon MCP server needs
    scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
    onError: () => setError('Google login failed')
  });

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: '#f4f4f9',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#2c3e50' }}>
          {isLoginMode ? 'Login' : 'Register'}
        </h2>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#555' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '1rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#555' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '1rem'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.75rem',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Please wait...' : (isLoginMode ? 'Login' : 'Register')}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem', color: '#666' }}>
          {isLoginMode ? (
            <>
              Don't have an account?{' '}
              <span
                onClick={() => { setIsLoginMode(false); setError(''); }}
                style={{ color: '#3498db', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Register here
              </span>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <span
                onClick={() => { setIsLoginMode(true); setError(''); }}
                style={{ color: '#3498db', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Login here
              </span>
            </>
          )}
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <div style={{ position: 'relative', margin: '1rem 0' }}>
            <span style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', backgroundColor: '#ccc', transform: 'translateY(-50%)' }}></span>
            <span style={{ position: 'relative', backgroundColor: 'white', padding: '0 10px', color: '#666' }}>OR</span>
          </div>
          <button
            onClick={() => googleLogin()}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '0.75rem',
              backgroundColor: 'white',
              color: '#757575',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            <svg style={{ marginRight: '10px' }} width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
