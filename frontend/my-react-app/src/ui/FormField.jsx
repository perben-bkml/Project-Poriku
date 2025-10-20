import React from 'react';

/**
 * FormField Component
 * A reusable form field component that handles text inputs, file inputs, and select dropdowns
 *
 * @param {string} label - The label text for the field
 * @param {string} name - The name attribute for the input
 * @param {string} type - The input type (text, file, select)
 * @param {string|File} value - The current value of the field
 * @param {function} onChange - Change handler function
 * @param {boolean} required - Whether the field is required
 * @param {array} options - Options for select dropdown (array of {value, label} objects or strings)
 * @param {string} placeholder - Placeholder text for input
 * @param {string} accept - File accept attribute (for file inputs)
 * @param {string} className - Additional CSS class names
 */
export default function FormField({
    label,
    name,
    type = 'text',
    value,
    onChange,
    required = false,
    options = [],
    placeholder = '',
    accept = '',
    className = ''
}) {
    const renderInput = () => {
        switch (type) {
            case 'select':
                return (
                    <select
                        name={name}
                        value={value}
                        onChange={onChange}
                        required={required}
                        className={`buku-tamu-form-input ${className}`}
                    >
                        {placeholder && <option value="">{placeholder}</option>}
                        {options.map((option, index) => {
                            // Handle both string arrays and object arrays
                            const optionValue = typeof option === 'string' ? option : option.value;
                            const optionLabel = typeof option === 'string' ? option : option.label;
                            return (
                                <option key={index} value={optionValue}>
                                    {optionLabel}
                                </option>
                            );
                        })}
                    </select>
                );

            case 'file':
                return (
                    <input
                        type="file"
                        name={name}
                        onChange={onChange}
                        required={required}
                        accept={accept}
                        className={`buku-tamu-form-input ${className}`}
                    />
                );

            default:
                return (
                    <input
                        type={type}
                        name={name}
                        value={value}
                        onChange={onChange}
                        required={required}
                        placeholder={placeholder}
                        className={`buku-tamu-form-input ${className}`}
                    />
                );
        }
    };

    return (
        <>
            <label style={{marginTop: '30px'}}>
                {label} {required && <span className='buku-tamu-required'>*</span>}
            </label>
            {renderInput()}
        </>
    );
}
