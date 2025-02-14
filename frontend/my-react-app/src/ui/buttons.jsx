
export function SubmitButton(props) {
    return (
        <input type="button" value={props.value} name={props.name} onClick={props.onClick} hidden={props.hidden}/>
    )
}