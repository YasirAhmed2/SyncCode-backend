export const validate = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        console.log("Validation successful for request body:", req.body);
        next();
    }
    catch (error) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({
            success: false,
            errors: error.errors,
        });
    }
};
