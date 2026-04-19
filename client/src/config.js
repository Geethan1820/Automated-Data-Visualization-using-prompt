// API base URL — reads from Vite env variable at build time.
// In Docker: set to "" (empty string) so requests go to the same origin.
// In local dev: defaults to http://localhost:8000
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default API;
