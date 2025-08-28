# Frontend Integration Guide

This guide shows how to integrate your React frontend with the new Google Docs PDF generation system.

## 1. Authentication Flow

### Step 1: Check if verification APIs are authenticated

```javascript
// Check authentication status
const checkVerifAuth = async () => {
    try {
        const response = await axios.get('/auth/verif/status');
        return response.data.authenticated;
    } catch (error) {
        return false;
    }
};
```

### Step 2: Redirect to OAuth if not authenticated

```javascript
// Redirect to verification OAuth
const authenticateVerif = () => {
    window.location.href = '/auth/google/verif';
};
```

## 2. PDF Generation Integration

### Method 1: Update existing generatePDF function

In your `Form-Verifikasi.jsx`, you can replace the existing `handleGeneratePDF` function:

```javascript
//Handle Generate PDF from Template
async function handleGeneratePDF() {
    try {
        setLoadingScreen(true);
        
        // Prepare template data with placeholders
        const templateData = {
            noSPM: searchedData[0],
            unitKerja: searchedData[1],
            tanggalUploadBerkas: formatDate(searchedData[2]),
            hasilVerifikasi: searchedData[3],
            catatan: searchedData[4],
            operator: searchedData[5],
            // Add more fields as needed for your template
            tanggalGenerate: new Date().toLocaleDateString('id-ID')
        };

        const response = await axios.post(`${import.meta.env.VITE_API_URL}/verifikasi/generate-pdf-from-template`, {
            templateData: templateData
        });

        if (response.status === 200) {
            const { viewLink, downloadLink, fileName } = response.data;
            
            setLoadingScreen(false);
            setPopupType("PDF");
            setIsAlert(true);
            
            // Optional: Open PDF in new tab
            window.open(viewLink, '_blank');
            
            setTimeout(() => {
                setIsAlert(false);
            }, 3000);
        }
    } catch (error) {
        setLoadingScreen(false);
        
        if (error.response?.status === 401) {
            // Not authenticated - redirect to OAuth
            window.location.href = '/auth/google/verif';
        } else {
            console.error("Error generating PDF from template:", error);
            // Handle other errors
        }
    }
}
```

### Method 2: Create new function for template-based PDF

```javascript
//Handle Generate PDF from Template (new function)
async function handleGenerateTemplatedPDF() {
    try {
        setLoadingScreen(true);
        
        const templateData = {
            noSPM: searchedData[0],
            unitKerja: searchedData[1],
            tanggalUploadBerkas: formatDate(searchedData[2]),
            hasilVerifikasi: searchedData[3],
            catatan: searchedData[4],
            operator: searchedData[5]
        };

        const response = await axios.post(`${import.meta.env.VITE_API_URL}/verifikasi/generate-pdf-from-template`, {
            templateData: templateData
        });

        if (response.status === 200) {
            setLoadingScreen(false);
            setPopupType("PDF Template");
            setIsAlert(true);
            
            // Store the PDF link for user access
            setPdfLink(response.data.viewLink);
            
            setTimeout(() => {
                setIsAlert(false);
            }, 3000);
        }
    } catch (error) {
        setLoadingScreen(false);
        console.error("Error generating templated PDF:", error);
    }
}
```

## 3. UI Updates

### Add new button for template PDF generation

In your form JSX, add a new button alongside the existing "Generate PDF" button:

```javascript
<div className="verif-submit-buttons">
    <VerifButton type="submit" value="Update Formulir" name="submit-form"/>
    <VerifButton type="button" value="Generate PDF" name="submit-form" onClick={handleGeneratePDF}/>
    <VerifButton type="button" value="Generate from Template" name="submit-form" onClick={handleGenerateTemplatedPDF}/>
</div>
```

### Add authentication check component

```javascript
const [isVerifAuthenticated, setIsVerifAuthenticated] = useState(false);

useEffect(() => {
    const checkAuth = async () => {
        const isAuth = await checkVerifAuth();
        setIsVerifAuthenticated(isAuth);
    };
    checkAuth();
}, []);

// Show authentication button if not authenticated
{!isVerifAuthenticated && (
    <div className="auth-warning">
        <p>Google Docs access not authenticated</p>
        <button onClick={authenticateVerif}>Authenticate Google Docs</button>
    </div>
)}
```

## 4. Google Docs Template Setup

### Template Placeholders

Create your Google Docs template with placeholders using double curly braces:

```
FORM VERIFIKASI

No SPM: {{noSPM}}
Unit Kerja: {{unitKerja}}
Tanggal Upload: {{tanggalUploadBerkas}}
Hasil Verifikasi: {{hasilVerifikasi}}
Catatan: {{catatan}}
Operator: {{operator}}

Generated on: {{tanggalGenerate}}
```

### Available Template Data

Based on your existing code, these fields are available:

- `noSPM` - SPM number
- `unitKerja` - Work unit 
- `tanggalUploadBerkas` - Upload date
- `hasilVerifikasi` - Verification result
- `catatan` - Notes/comments
- `operator` - Operator name
- `tanggalGenerate` - Generation date

## 5. Error Handling

```javascript
const handlePDFError = (error) => {
    if (error.response?.status === 401) {
        // Not authenticated
        alert('Please authenticate with Google first');
        window.location.href = '/auth/google/verif';
    } else if (error.response?.status === 400) {
        // Template not configured
        alert('Template document not configured. Contact administrator.');
    } else {
        // Other errors
        alert('Failed to generate PDF. Please try again.');
    }
};
```

## 6. Setup Requirements

1. **Environment Variables**: Ensure all verification OAuth variables are set
2. **Google Docs Template**: Create and configure `DOCS_ID_VERIF`
3. **Authentication**: Users must authenticate via `/auth/google/verif`
4. **Folder Permissions**: Ensure `DRIVE_FOLDER_ID_VERIF` exists and is accessible

The system will automatically handle template copying, placeholder replacement, PDF generation, and link creation.