import React, {useState, useRef, useEffect} from "react";

export function SubmitButton(props) {
    return (
        <input type="button" value={props.value} name={props.name} onClick={props.onClick} hidden={props.hidden}/>
    )
}

export function VerifButton(props) {
    return (
        <input className={`verif-btn ${props.pressed ? "verif-btn-pressed" : ""}`} type={props.type} value={props.value} name={props.name} onClick={props.onClick}/>
    )
}

export function UploadButton({title, onFileSelect}) {
    //State
    const [file, setFile] = useState(null);

    //Ref to access hidden input element
    const fileRef = useRef(null);

    //Handlers
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            setFile(file);
        }
    }
    const handleClearClick = () => {
        setFile(null);
        if (fileRef.current) {
            fileRef.current.value = null;
        }
    }

    useEffect(() => {
        if (onFileSelect) {
            onFileSelect(file);
        }
    }, [file, onFileSelect]);

    return (
        <div className="upload-btn">
            <input type="file" ref={fileRef} onChange={handleFileChange} hidden />
            <button type={"button"} className="verif-btn" onClick={() => fileRef.current.click()}>Upload {title}</button>
            { file &&
            <button type={"button"} className="verif-btn" onClick={handleClearClick}>Hapus File</button>
            }
            { file &&
                <p className={"upload-name"}>{file.name}</p>
            }
        </div>
    )
}