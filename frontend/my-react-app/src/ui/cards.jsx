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
            <h2 className="wide-card-title">{title}</h2>
            <div className="wide-card-content">
                { title === "Sudah Verifikasi" ?
                    <TableKelola type="kelola" feature="SudahVerif" header={props.tableHead} content={props.tableContent} fullContent={props.fullContent} changeComponent={props.changeComponent} aksiData={props.aksiData}/>
                    : <TableKelola type="kelola" header={props.tableHead} content={props.tableContent} fullContent={props.fullContent} changeComponent={props.changeComponent} aksiData={props.aksiData}/>
                }
            </div>
        </div>
    )
}