import PropTypes from "prop-types";
import { TableKelola } from "./tables"


export function Card(props) {
    return (
        <div className="bg-card card">
            <h2 className="card-title">{props.title}</h2>
            <div className="card-content">
                <h2>{props.content}</h2>
            </div>
        </div>
    )
}

export function WideTableCard(props) {
    const title = props.title;

    return (
        <div className="bg-card wide-card">
            <div className="wide-card-head">
                <h2 className="wide-card-title">{title}</h2>
                {props.actions}
            </div>
            {props.toolbar}
            <div className="wide-card-content">
                <TableKelola type="kelola"
                    feature={props.feature !== undefined ? props.feature : (title === "Sudah Verifikasi" ? "SudahVerif" : undefined)}
                    aksiLabel={props.aksiLabel} aksiTarget={props.aksiTarget} loading={props.loading}
                    header={props.tableHead} content={props.tableContent} fullContent={props.fullContent}
                    changeComponent={props.changeComponent} aksiData={props.aksiData}/>
            </div>
        </div>
    )
}

WideTableCard.propTypes = {
    title: PropTypes.string,
    actions: PropTypes.node,
    toolbar: PropTypes.node,
    feature: PropTypes.string,
    aksiLabel: PropTypes.string,
    aksiTarget: PropTypes.string,
    loading: PropTypes.bool,
    tableHead: PropTypes.array,
    tableContent: PropTypes.array,
    fullContent: PropTypes.array,
    changeComponent: PropTypes.func,
    aksiData: PropTypes.func,
};
// Home.jsx - lite realisasi dashboard
export function RealisasiCircle({percent, size = 190, stroke = 18}) {
    const value = Math.min(Math.max(percent || 0, 0), 100);
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const overspent = percent > 100;

    return (
        <svg width={size} height={size} role="img" aria-label={`Realisasi ${value.toFixed(2)} persen`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E4E9F2" strokeWidth={stroke}/>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
                    stroke={overspent ? "#BD1404" : "#00449C"}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - value / 100)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{transition: 'stroke-dashoffset 0.4s ease-in-out'}}/>
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle"
                  fontSize="1.7rem" fontWeight="600" fill="#00204A">
                {(percent || 0).toFixed(2)}%
            </text>
            <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle"
                  fontSize="0.85rem" fill="#00449C">
                Realisasi
            </text>
        </svg>
    )
}
