require('dotenv').config();
const appPort = process.env.PORT || process.env.APP_PORT || 3030;
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json({ extended: true }));
app.use(express.urlencoded({ extended: false }));

app.use('/', routes);

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

app.listen(appPort, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${appPort}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});
