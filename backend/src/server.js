require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const personalRoutes = require('./routes/personal');
const usersRoutes = require('./routes/users');
const criteriosRoutes = require('./routes/criterios');
const factoresRoutes = require('./routes/factores');
const nivelesRoutes = require('./routes/niveles');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/personal', personalRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/criterios', criteriosRoutes);
app.use('/api/factores', factoresRoutes);
app.use('/api/niveles', nivelesRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Backend escuchando en :${PORT}`));
}

module.exports = app;
