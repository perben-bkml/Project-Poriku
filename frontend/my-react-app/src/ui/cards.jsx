
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