import { createContext, useCallback, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Fade from "@mui/material/Fade";

// Saving lives here, not in the screen that started it: menu changes unmount that
// component, taking any chance of reporting the result with it. This provider sits
// above the router, so a save reports back wherever the user has gone. It does not
// survive a reload - a File cannot go in localStorage, so there is nothing to resume.
export const BackgroundTaskContext = createContext({
    tasks: [], runTask: () => {}, lastCompleted: null,
});

const DISMISS_AFTER_MS = 6000;

export function BackgroundTaskProvider({ children }) {
    const [tasks, setTasks] = useState([]);
    // Bumped when anything finishes, so a screen can refetch without tracking which task
    const [lastCompleted, setLastCompleted] = useState(null);
    const lastId = useRef(0);

    const runTask = useCallback(({ label, tag, run }) => {
        const id = ++lastId.current;
        setTasks(current => [...current, { id, label, status: "running" }]);

        (async () => {
            let status = "done";
            let message = "";
            try {
                message = (await run()) || "Selesai.";
            } catch (error) {
                console.error(`Tugas latar belakang gagal: ${label}`, error);
                status = "error";
                message = error?.response?.data?.message || "Gagal, coba lagi.";
            }
            setTasks(current => current.map(task => task.id === id ? { ...task, status, message } : task));
            setLastCompleted({ id, tag, status });
            setTimeout(() => setTasks(current => current.filter(task => task.id !== id)), DISMISS_AFTER_MS);
        })();

        return id;
    }, []);

    return (
        <BackgroundTaskContext.Provider value={{ tasks, runTask, lastCompleted }}>
            {children}
            {/* Same corner and z-index as PopupAlert, but stacked */}
            <div style={{ position: "fixed", top: "100px", right: "16px", zIndex: 1300,
                          display: "flex", flexDirection: "column", gap: "8px" }}>
                {tasks.map(task => (
                    <Fade in key={task.id}>
                        <Alert severity={task.status === "running" ? "info" : task.status === "error" ? "error" : "success"}
                               sx={{ width: "280px" }}>
                            {task.status === "running" ? `${task.label} sedang disimpan…` : task.message}
                        </Alert>
                    </Fade>
                ))}
            </div>
        </BackgroundTaskContext.Provider>
    );
}
