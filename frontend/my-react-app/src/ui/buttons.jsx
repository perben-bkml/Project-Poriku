import {useState, useRef, useEffect} from "react";
import PropTypes from "prop-types";

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

export function UploadButton({title, onFileSelect, accept, maxSizeMb}) {
    //State
    const [file, setFile] = useState(null);
    const [error, setError] = useState("");

    //Ref to access hidden input element
    const fileRef = useRef(null);

    //Handlers
    const handleClearClick = () => {
        setFile(null);
        setError("");
        if (fileRef.current) {
            fileRef.current.value = null;
        }
    }

    const handleFileChange = (event) => {
        const picked = event.target.files[0];
        if (!picked) {
            return;
        }
        // Rejected here as well as on the server, so an oversized file is never uploaded
        if (accept && picked.type !== accept) {
            setFile(null);
            setError("Berkas harus berformat PDF.");
            if (fileRef.current) fileRef.current.value = null;
            return;
        }
        if (maxSizeMb && picked.size > maxSizeMb * 1024 * 1024) {
            setFile(null);
            setError(`Ukuran berkas melebihi ${maxSizeMb} MB.`);
            if (fileRef.current) fileRef.current.value = null;
            return;
        }
        setError("");
        setFile(picked);
    }

    useEffect(() => {
        if (onFileSelect) {
            onFileSelect(file);
        }
    }, [file, onFileSelect]);

    return (
        <div className="upload-btn">
            <input type="file" ref={fileRef} onChange={handleFileChange} accept={accept} hidden />
            <button type={"button"} className="verif-btn" onClick={() => fileRef.current.click()}>Upload {title}</button>
            { file &&
            <button type={"button"} className="verif-btn" onClick={handleClearClick}>Hapus File</button>
            }
            { file &&
                <p className={"upload-name"}>{file.name}</p>
            }
            { error && <p className={"upload-error"}>{error}</p> }
        </div>
    )
}

UploadButton.propTypes = {
    title: PropTypes.string,
    onFileSelect: PropTypes.func,
    accept: PropTypes.string,
    maxSizeMb: PropTypes.number,
};