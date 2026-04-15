import { useState } from 'react';
import axios from 'axios';

// Determine API URL dynamically based on environment variables
const isHttps = import.meta.env.VITE_HTTPS_ENABLED === 'true';
const apiIp = import.meta.env.VITE_API_IP || 'localhost';
const apiPort = import.meta.env.VITE_API_PORT || '3001';
const API_URL = `${isHttps ? 'https' : 'http'}://${apiIp}:${apiPort}`;

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
        response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      } else {
        response = await axios.post(`${API_URL}/api/auth/register`, { email, password });
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
      </div>
    </div>
  );
}

export default Login;
