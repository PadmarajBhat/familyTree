import * as genai from '@google/genai';
console.log(JSON.stringify(Object.keys(genai), null, 2));
console.log('SchemaType:', JSON.stringify(genai.SchemaType, null, 2));
console.log('Modality:', JSON.stringify(genai.Modality, null, 2));
