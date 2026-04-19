import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import API from '../config';

const AuthContext = createContext(null);

function readStoredProfile() {
    try {
        const s = localStorage.getItem('datasight_user');
        if (s) return JSON.parse(s);
    } catch { /* ignore */ }
    return null;
}

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem('datasight_token'));
    const [user, setUser] = useState(() => {
        const t = localStorage.getItem('datasight_token');
        return t ? readStoredProfile() : null;
    });
    const [loading, setLoading] = useState(false);

    const logout = useCallback(() => {
        localStorage.removeItem('datasight_token');
        localStorage.removeItem('datasight_user');
        setToken(null);
        setUser(null);
    }, []);

    useEffect(() => {
        if (!token) {
            setUser(null);
            return;
        }
        const p = readStoredProfile();
        if (p) setUser(p);
    }, [token]);

    const login = async (username, password) => {
        setLoading(true);
        try {
            const form = new URLSearchParams();
            form.append('username', username);
            form.append('password', password);
            const res = await axios.post(`${API}/login`, form, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            const { access_token, username: uname, user_id } = res.data;
            const profile = { username: uname, id: user_id };
            localStorage.setItem('datasight_token', access_token);
            localStorage.setItem('datasight_user', JSON.stringify(profile));
            setToken(access_token);
            setUser(profile);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.response?.data?.detail || 'Login failed.' };
        } finally {
            setLoading(false);
        }
    };

    const signup = async (username, password) => {
        setLoading(true);
        try {
            const res = await axios.post(`${API}/signup`, { username, password });
            const { access_token, username: uname, user_id } = res.data;
            const profile = { username: uname, id: user_id };
            localStorage.setItem('datasight_token', access_token);
            localStorage.setItem('datasight_user', JSON.stringify(profile));
            setToken(access_token);
            setUser(profile);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.response?.data?.detail || 'Signup failed.' };
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const req = axios.interceptors.request.use((config) => {
            const t = localStorage.getItem('datasight_token');
            if (t) config.headers.Authorization = `Bearer ${t}`;
            return config;
        });
        const res = axios.interceptors.response.use(
            (r) => r,
            (err) => {
                if (err.response?.status === 401) {
                    localStorage.removeItem('datasight_token');
                    localStorage.removeItem('datasight_user');
                    setToken(null);
                    setUser(null);
                }
                return Promise.reject(err);
            }
        );
        return () => {
            axios.interceptors.request.eject(req);
            axios.interceptors.response.eject(res);
        };
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, login, signup, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
