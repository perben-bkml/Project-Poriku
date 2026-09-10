import axios from 'axios';

// Set globally just in case other files import axios directly instead of apiClient
axios.defaults.withCredentials = true;

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true
});

// Inject auth token from localStorage as Authorization: Bearer header.
apiClient.interceptors.request.use(config => {
    const token = localStorage.getItem('poriku-auth-token');
    if (token) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Auto-inject year from localStorage into all requests
    const year = localStorage.getItem('poriku-selected-year') || new Date().getFullYear().toString();

    if (config.params) {
        config.params.year = year;
    } else {
        config.params = { year };
    }

    if (config.method === 'post' && config.data) {
        // Check if data is FormData
        if (config.data instanceof FormData) {
            // Append year to FormData
            config.data.append('year', year);
        } else {
            // Regular object, spread it
            config.data = { ...config.data, year };
        }
    }

    return config;
});

export default apiClient;
