import CircularProgress from '@mui/material/CircularProgress';

export default function LoadingAnimate({ size = "60px", thickness = 3 }) {
    return (
        <div className="loading-antri">
            <CircularProgress size={size} thickness={thickness} />
        </div>
    );
}

export function LoadingScreen() {
    return (
    <div className="loading">
        <CircularProgress size="80px" thickness={4}/>
    </div>
    )
}