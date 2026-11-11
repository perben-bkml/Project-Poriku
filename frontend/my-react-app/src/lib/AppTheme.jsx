import {useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {useLocation} from 'react-router-dom';
import PropTypes from 'prop-types';
import {createTheme, ThemeProvider} from '@mui/material/styles';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';

const STORAGE_KEY = 'poriku-theme';
const validPreference = value => value === 'dark' ? 'dark' : 'light';

export default function AppTheme({children}) {
    const {pathname} = useLocation();
    // Match the actual application routes; public pages and unknown URLs stay light.
    // Keep the pre-paint route check in index.html aligned with this list.
    const themeEnabled = /^\/(?:home|menu-bendahara|menu-verifikasi)\/?$/i.test(pathname);
    const [preference, setPreference] = useState(() => {
        try { return validPreference(localStorage.getItem(STORAGE_KEY)); }
        catch { return 'light'; }
    });
    const mode = themeEnabled ? preference : 'light';

    useEffect(() => {
        const stored = event => {
            if (event.key === STORAGE_KEY || event.key === null) setPreference(validPreference(event.newValue));
        };
        window.addEventListener('storage', stored);
        return () => {
            window.removeEventListener('storage', stored);
        };
    }, []);

    useLayoutEffect(() => {
        document.documentElement.dataset.theme = mode;
        document.documentElement.style.colorScheme = mode;
    }, [mode]);

    const theme = useMemo(() => createTheme({
        palette: {
            mode,
            ...(mode === 'dark' ? {
                primary: {main: '#a5c9ff'},
                background: {default: '#0d1521', paper: '#172333'},
                text: {primary: '#f6f8fc', secondary: '#c8d3e1'},
                divider: '#324359',
            } : {}),
        },
        ...(mode === 'dark' ? {
            components: {
                MuiButton: {styleOverrides: {containedPrimary: {
                    backgroundColor: '#294f7b', color: '#ffffff', boxShadow: 'inset 0 0 0 1px #6087b5',
                    '&:hover': {backgroundColor: '#345f8e', boxShadow: 'inset 0 0 0 1px #8fb2da'},
                    '&.Mui-disabled': {backgroundColor: '#1d2c3f', color: '#97a8bd', boxShadow: 'none'},
                }}},
                MuiTableContainer: {styleOverrides: {root: {backgroundColor: '#172333'}}},
                MuiTableCell: {styleOverrides: {
                    root: {borderColor: '#324359'},
                    head: {backgroundColor: '#111c2b', color: '#ffffff'},
                    body: {color: '#f6f8fc'},
                }},
            },
        } : {}),
    }), [mode]);

    function changePreference(event) {
        const value = validPreference(event.target.value);
        setPreference(value);
        try { localStorage.setItem(STORAGE_KEY, value); }
        catch { /* The selected theme still works when browser storage is unavailable. */ }
    }

    return <ThemeProvider theme={theme}>
        {children}
        {themeEnabled && <label className="theme-picker">
            {mode === 'dark' ? <DarkModeOutlinedIcon fontSize="small" /> : <LightModeOutlinedIcon fontSize="small" />}
            <span className="theme-picker-label">Tema</span>
            <select aria-label="Tema tampilan" value={preference} onChange={changePreference}>
                <option value="light">Terang</option>
                <option value="dark">Gelap</option>
            </select>
        </label>}
    </ThemeProvider>;
}

AppTheme.propTypes = {children: PropTypes.node.isRequired};
