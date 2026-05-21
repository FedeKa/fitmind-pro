const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Initialize Anthropic client
const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

// User data storage (by email)
const userDataStore = {};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Server running ✅', timestamp: new Date().toISOString() });
});

// Serve the HTML app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'fitmind_pro.html'));
});

app.get('/fitmind_pro.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'fitmind_pro.html'));
});

// ==================== API ENDPOINTS ====================

// Generate menus from selected foods
app.post('/api/generate-menus', async (req, res) => {
  try {
    const { objective, foods, calorieTarget, proteinTarget } = req.body;

    if (!objective || !foods || foods.length === 0) {
      return res.status(400).json({ error: 'Objetivo y alimentos requeridos' });
    }

    const foodsList = foods.join(', ');
    const prompt = `Eres un nutricionista deportivo experto. Debes crear 3 menús COMPLETAMENTE DIFERENTES para alguien con objetivo: ${objective}.

ALIMENTOS DISPONIBLES: ${foodsList}

RESTRICCIONES:
- Calorías diarias: ${calorieTarget || 2000} kcal
- Proteína diaria: ${proteinTarget || 150}g
- Usa PRINCIPALMENTE los alimentos disponibles

Para CADA menú proporciona (desayuno, almuerzo, cena):
**[NOMBRE DEL PLATO]**
Ingredientes: [lista completa]
Preparación: [pasos detallados]
Macros: XXX cal | XXg proteína | XXg carbos | XXg grasas

Crea 3 menús DIFERENTES pero usando los alimentos disponibles. Cada uno debe cumplir objetivos calóricos y de macros.`;

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    const menusText = message.content[0].type === 'text' ? message.content[0].text : '';
    const menus = parseMenus(menusText);

    res.json({
      success: true,
      objective,
      menus: menus.length > 0 ? menus : [{ content: menusText }],
      rawResponse: menusText
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Error generando menús' });
  }
});

// Analyze grocery list photo
app.post('/api/analyze-grocery-list', async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Imagen requerida' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            type: 'text',
            text: 'Analiza esta foto de lista de compras o ticket de supermercado. Extrae TODOS los productos/alimentos que veas. Lista cada uno en formato: "Producto (cantidad si aparece)". Enfócate en proteínas, carbohidratos y grasas útiles para fitness.'
          }
        ]
      }]
    });

    const foodsText = message.content[0].type === 'text' ? message.content[0].text : '';
    const foods = foodsText.split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.replace(/^[-•*]\s*/, '').trim());

    res.json({ success: true, foods, rawAnalysis: foodsText });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Error analizando foto' });
  }
});

// Nutrition plan
app.post('/api/nutrition-plan', async (req, res) => {
  try {
    const { objective, weight, height, age, activityLevel } = req.body;

    const prompt = `Como nutricionista deportivo, proporciona un plan nutricional personalizado:
- Objetivo: ${objective}
- Peso: ${weight || 'No especificado'} kg
- Altura: ${height || 'No especificada'} cm
- Edad: ${age || 'No especificado'} años
- Actividad: ${activityLevel || 'Moderada'}

Proporciona: calorías recomendadas, macros (proteína/carbos/grasas), alimentos recomendados, a evitar, timing de comidas, tips específicos.`;

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({
      success: true,
      objective,
      plan: message.content[0].type === 'text' ? message.content[0].text : ''
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Daily motivation
app.post('/api/motivation', async (req, res) => {
  try {
    const { objective, daysCompleted, currentLevel } = req.body;

    const prompt = `Eres coach de fitness con mentalidad de tiburón. Genera UN mensaje motivacional PODEROSO (2-3 frases máximo) para:
- Objetivo: ${objective || 'Fitness'}
- Días completados: ${daysCompleted || 0}
- Nivel actual: ${currentLevel || 1}

Hazlo directo, sin florituras, puro fuego mental. Específico para su objetivo.`;

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({
      success: true,
      motivation: message.content[0].type === 'text' ? message.content[0].text : ''
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Training routine
app.post('/api/training-routine', async (req, res) => {
  try {
    const { objective, duration, experience } = req.body;

    const prompt = `Eres entrenador deportivo profesional. Crea una rutina de ${duration} para:
- Objetivo: ${objective}
- Experiencia: ${experience || 'intermedia'}

Proporciona: estructura semanal, ejercicios específicos (series/reps), tiempo estimado, progresión, días de descanso, notas de forma y seguridad. Hazlo práctico y realista.`;

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({
      success: true,
      objective,
      duration,
      routine: message.content[0].type === 'text' ? message.content[0].text : ''
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate macros for custom food
app.post('/api/calculate-macros', async (req, res) => {
  try {
    const { foodName, grams } = req.body;

    if (!foodName || !grams) {
      return res.status(400).json({ error: 'Nombre de alimento y gramos requeridos' });
    }

    const prompt = `Eres nutricionista experto. Para el alimento "${foodName}" con una cantidad de ${grams} gramos, proporciona EXACTAMENTE:
- Calorías totales
- Proteína en gramos
- Carbohidratos en gramos
- Grasas en gramos

Proporciona SOLO números en este formato exacto (una línea por cada macro):
CALORIES:XXX
PROTEIN:XX
CARBS:XX
FATS:XX

Si no conoces el alimento exacto, estima basado en alimentos similares.`;

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse macros from response
    const lines = text.split('\n');
    const macros = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0
    };

    lines.forEach(line => {
      if (line.includes('CALORIES:')) macros.calories = parseInt(line.split(':')[1]) || 0;
      if (line.includes('PROTEIN:')) macros.protein = parseFloat(line.split(':')[1]) || 0;
      if (line.includes('CARBS:')) macros.carbs = parseFloat(line.split(':')[1]) || 0;
      if (line.includes('FATS:')) macros.fats = parseFloat(line.split(':')[1]) || 0;
    });

    res.json({
      success: true,
      foodName,
      grams,
      macros
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Error calculando macros' });
  }
});

// Analyze receipt photo and extract products
app.post('/api/analyze-receipt', async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Imagen requerida' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            type: 'text',
            text: 'Analiza esta foto de ticket de supermercado. Extrae TODOS los productos/alimentos que veas. Lista cada uno en formato: "Producto (cantidad si aparece)". Enfócate en proteínas, carbohidratos, grasas. Si hay varios de un mismo producto, lista todos.'
          }
        ]
      }]
    });

    const foodsText = message.content[0].type === 'text' ? message.content[0].text : '';
    const foods = foodsText.split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.replace(/^[-•*]\s*/, '').trim());

    res.json({
      success: true,
      foods: foods,
      rawAnalysis: foodsText
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Error analizando foto' });
  }
});

// Generate exercise recommendations based on user profile
app.post('/api/exercise-recommendations', async (req, res) => {
  try {
    const { weight, height, age, objective } = req.body;

    if (!weight || !height || !age || !objective) {
      return res.status(400).json({ error: 'Datos de perfil incompletos' });
    }

    const prompt = `Como entrenador deportivo especializado, crea rutina de ejercicios personalizada para:
- Peso: ${weight}kg
- Altura: ${height}cm
- Edad: ${age} años
- Objetivo: ${objective}

Calcula IMC, frecuencia cardíaca máxima estimada, y proporciona:
1. Rutina semanal específica (días y ejercicios)
2. Series y repeticiones ajustadas
3. Intensidad y tiempo de descanso
4. Progresión recomendada
5. Consideraciones especiales de seguridad

Hazlo realista, práctico y motivador. Enfoque en tiburón imparable.`;

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({
      success: true,
      userProfile: { weight, height, age, objective },
      recommendations: message.content[0].type === 'text' ? message.content[0].text : ''
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Error generando recomendaciones' });
  }
});

// ==================== SYNC ENDPOINTS ====================

// Save user data (by email)
app.post('/api/sync/save', (req, res) => {
  try {
    const { email, appState } = req.body;

    if (!email || !appState) {
      return res.status(400).json({ error: 'Email y appState requeridos' });
    }

    userDataStore[email] = {
      ...appState,
      lastSync: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Datos guardados',
      email: email,
      lastSync: userDataStore[email].lastSync
    });

  } catch (error) {
    console.error('Sync Save Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load user data (by email)
app.post('/api/sync/load', (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requerido' });
    }

    const data = userDataStore[email] || null;

    res.json({
      success: true,
      data: data,
      found: !!data
    });

  } catch (error) {
    console.error('Sync Load Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function parseMenus(text) {
  const menus = [];
  const parts = text.split(/Menú\s+[0-9]|Menu\s+[0-9]/i);

  for (let i = 1; i < parts.length; i++) {
    if (parts[i].trim().length > 50) {
      menus.push({ content: parts[i].trim() });
    }
  }

  return menus;
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Start server
app.listen(PORT, () => {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  🦈 FitMind Server INICIADO');
  console.log('════════════════════════════════════════════════════');
  console.log(`✅ Puerto: ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🍎 App: http://localhost:${PORT}/`);
  console.log(`⏸️  Presiona Ctrl+C para detener\n`);
});
