export const FUNCTION_DECLARATIONS = [
    {
        name: "get_person_details",
        description: "Fetch detailed information about a person (DOB, Location, Education, Hobbies, etc.) using their NodeID.",
        parameters: {
            type: "OBJECT",
            properties: {
                node_id: { type: "STRING", description: "The unique ID of the person." }
            },
            required: ["node_id"]
        }
    },
    {
        name: "add_person",
        description: "Add a new family member to the tree. You can also provide initial details like phone, email, or DOB.",
        parameters: {
            type: "OBJECT",
            properties: {
                name: { type: "STRING", description: "Full name of the person." },
                gender: { type: "STRING", enum: ["male", "female", "other"], description: "Gender of the person." },
                relation: { type: "STRING", description: "Relation (e.g., father, wife, son, daughter)." },
                anchor_node_id: { type: "STRING", description: "The ID of the existing family member this person is related to." },
                phone: { type: "STRING", description: "Phone number (optional)." },
                email: { type: "STRING", description: "Email address (optional)." },
                dob: { type: "STRING", description: "Date of birth in YYYY-MM-DD format (optional)." }
            },
            required: ["name", "gender", "relation", "anchor_node_id"]
        }
    },
    {
        name: "update_person",
        description: "Update or correct information for an existing family member.",
        parameters: {
            type: "OBJECT",
            properties: {
                node_id: { type: "STRING", description: "The unique ID of the person to update." },
                updates: {
                    type: "OBJECT",
                    description: "Fields to update.",
                    properties: {
                        name: { type: "STRING" },
                        gender: { type: "STRING", enum: ["male", "female", "other"] },
                        phone: { type: "STRING" },
                        email: { type: "STRING" },
                        dob: { type: "STRING", description: "Date of birth (YYYY-MM-DD)" },
                        dod: { type: "STRING", description: "Date of death (YYYY-MM-DD)" },
                        hobbies: { type: "ARRAY", items: { type: "STRING" } },
                        education: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    degree: { type: "STRING" },
                                    major: { type: "STRING" }
                                }
                            }
                        },
                        occupation: {
                            type: "OBJECT",
                            properties: {
                                role: { type: "STRING" },
                                organization: { type: "STRING" }
                            }
                        },
                        notes: { type: "STRING" },
                        address: {
                            type: "OBJECT",
                            properties: {
                                freeform: { type: "STRING" }
                            }
                        },
                        location: {
                            type: "OBJECT",
                            properties: {
                                zipcode: { type: "STRING" },
                                district: { type: "STRING" },
                                state: { type: "STRING" },
                                country: { type: "STRING" }
                            }
                        }
                    }
                }
            },
            required: ["node_id", "updates"]
        }
    },
    {
        name: "search_family_tree",
        description: "Search for a person in the family tree by name.",
        parameters: {
            type: "OBJECT",
            properties: {
                query: { type: "STRING", description: "The name or part of the name to search for." }
            },
            required: ["query"]
        }
    }
];
