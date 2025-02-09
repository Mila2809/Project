import express, { Request, Response } from "express";
import supabase from "./supabaseClient.js";
import path from "path";
import { hashPassword } from "./hash.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../", "login.html"));
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

app.post("/register", async (req: Request, res: Response) => {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
        res.status(400).json({
            success: false,
            message: "Please fill in all fields.",
        });
        return;
    }
    try {
        const { data: authData, error: authError } = await supabase.auth.signUp(
            {
                email: email,

                password: password,
            }
        );

        if (authError) {
            res.status(400).json({
                success: false,
                message: "Error during registration",
                error: authError.message,
            });
            return;
        }

        const pwd = await hashPassword(password);
        const { data: userData, error: dbError } = await supabase
            .from("user")
            .insert({
                id: authData.user?.id,
                email: email,
                username: username,
                password: pwd,
            });

        if (dbError) {
            res.status(400).json({
                success: false,
                message: "Error when adding user to database",
                error: dbError.message,
            });
            return;
        }
        res.json({
            success: true,
            message: "Successful registration",
            data: { email, username, password },
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

app.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({
            success: false,
            message: "Please fill in all fields.",
        });
        return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.debug(error);
        res.status(400).json({
            success: false,
            message: "Wrong password or email",
        });
    } else {
        res.json({
            success: true,
            message: "successful login",
            data: { email, password },
        });
    }
});

app.get("/index", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../", "index.html"));
});

app.get("/task", async (req: Request, res: Response) => {
    const { data: userLogged, error: authError } =
        await supabase.auth.getUser();
    if (authError || !userLogged) {
        res.status(400).json({
            success: false,
            message: "No users logged in",
        });
        return;
    }

    const { data, error } = await supabase
        .from("tache")
        .select("*")
        .eq("user", userLogged.user.id);
    if (error) {
        res.status(400).json({
            success: false,
            message: "Error while retrieving tasks",
        });
        return;
    }
    res.json({
        success: true,
        message: "Recovered tasks",
        data: data,
    });
});

app.post("/add_task", async (req: Request, res: Response) => {
    const { data: userLogged, error: authError } =
        await supabase.auth.getUser();
    if (authError || !userLogged) {
        res.status(400).json({
            success: false,
            message: "No users logged in",
        });
        return;
    }

    const { title, description, deadline } = req.body;

    if (!title || !description || !deadline) {
        res.status(400).json({
            success: false,
            message: "Veuillez remplir tous les champs.",
        });
        return;
    }

    const id = userLogged.user.id;
    const { data: taskData, error: dbError } = await supabase
        .from("tache")
        .insert({
            title: title,
            description: description,
            status: false,
            date: new Date(deadline),
            user: id,
        });

    if (dbError) {
        res.status(400).json({
            success: false,
            message:
                "Erreur lors de l'ajout de la tâche dans la base de données",
            error: dbError.message,
        });
        return;
    }
    res.json({
        success: true,
        message: "Tâche ajoutée avec succès",
        data: taskData,
    });
});
app.put("/status_task", async (req: Request, res: Response) => {
    const { data: userLogged, error: authError } =
        await supabase.auth.getUser();
    if (authError || !userLogged) {
        res.status(400).json({
            success: false,
            message: "Aucun utilisateur connecté",
        });
        return;
    }

    const { id, status } = req.body;
    if (!id || typeof status !== "boolean") {
        res.status(400).json({
            success: false,
            message: "Veuillez fournir un ID de tâche et un état valide.",
        });
        return;
    }

    try {
        const { data: existingData, error: fetchError } = await supabase
            .from("tache")
            .select("id")
            .eq("id", id)
            .single();

        if (!existingData) {
            res.status(404).json({
                success: false,
                message: "Aucune tâche trouvée avec cet ID.",
            });
            return;
        }

        const { data, error } = await supabase
            .from("tache")
            .update({ status: status })
            .eq("id", id)
            .select();

        if (error) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de la mise à jour du status.",
                error: error.message,
            });
            return;
        }
        res.json({
            success: true,
            message: "Mise à jour du status de la tache faite avec succès.",
            data: data,
        });
        return;
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Erreur serveur.",
            error: error.message,
        });
        return;
    }
});
app.delete("/delete_task", async (req: Request, res: Response) => {
    const { data: userLogged, error: authError } =
        await supabase.auth.getUser();
    if (authError || !userLogged) {
        res.status(400).json({
            success: false,
            message: "Aucun utilisateur connecté",
        });
        return;
    }
    try {
        const { id } = req.body;
        if (!id) {
            res.status(400).json({
                success: false,
                message: "Veuillez fournir l'ID de la tâche à supprimer.",
            });
            return;
        }

        const { data: existingData, error: fetchError } = await supabase
            .from("tache")
            .select("*")
            .eq("id", id)
            .single();

        if (!existingData) {
            res.status(404).json({
                success: false,
                message: "Aucune tâche trouvée avec cet ID.",
            });
            return;
        }

        if (existingData.user != userLogged.user.id) {
            res.status(403).json({
                success: false,
                message:
                    "Vous ne pouvez pas supprimer une tâche qui ne vous appartient pas.",
            });
            return;
        }
        const { data: deleteData, error: deleteError } = await supabase
            .from("tache")
            .delete()
            .eq("id", id);

        if (deleteError) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de la suppression de la tâche.",
                error: deleteError.message,
            });
            return;
        }

        res.json({
            success: true,
            message: "Tâche supprimée avec succès.",
            data: deleteData,
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Erreur serveur.",
            error: error.message,
        });
        return;
    }
});

app.get("/user", async (req: Request, res: Response) => {
    const { data: userLogged, error: authError } =
        await supabase.auth.getUser();
    if (authError || !userLogged) {
        res.status(400).json({
            success: false,
            message: "Aucun utilisateur connecté",
        });
    }
    res.status(200).json({
        success: true,
        message: "Userrécupérées",
        data: userLogged,
    });
});
