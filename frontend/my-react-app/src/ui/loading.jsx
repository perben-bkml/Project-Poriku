import CircularProgress from '@mui/material/CircularProgress';

export default function LoadingAnimate({ size = "60px", thickness = 4 }) {
    return (
        <div className="loading-antri">
            <CircularProgress size={size} thickness={thickness} />
        </div>
    );
}