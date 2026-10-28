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
