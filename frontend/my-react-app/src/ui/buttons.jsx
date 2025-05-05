
export function SubmitButton(props) {
    return (
        <input type="button" value={props.value} name={props.name} onClick={props.onClick} hidden={props.hidden}/>
    )
}

export function VerifButton(props) {
    return (
        <input className="verif-btn" type={props.type} value={props.value} name={props.name} onClick={props.onClick}/>
    )
}