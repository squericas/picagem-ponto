const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./ponto.db');

db.serialize(() => {
    // Tabela de Funcionários
    db.run(`
        CREATE TABLE IF NOT EXISTS funcionarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            nome_completo TEXT NOT NULL,
            pin TEXT NOT NULL DEFAULT '0000',
            primeiro_acesso BOOLEAN DEFAULT 1
        )
    `);

// Tabela de Horários Previstos (LLM) com suporte para refeição
db.run(`
    CREATE TABLE IF NOT EXISTS horarios_previstos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER,
        data TEXT NOT NULL,
        entrada_prevista TEXT NOT NULL,
        saida_prevista TEXT NOT NULL,
        refeicao BOOLEAN DEFAULT 0,          -- 1 se tem direito a refeição (desconta 30 min), 0 se não tem
        pausa_minutos INTEGER DEFAULT 0,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
    )
`);

    // Tabela de Picagens Reais
    db.run(`
        CREATE TABLE IF NOT EXISTS picagens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            funcionario_id INTEGER,
            tipo TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
        )
    `);

    // Inserir utilizadores de teste se a tabela estiver vazia
    db.get("SELECT COUNT(*) AS total FROM funcionarios", (err, row) => {
        if (row.total === 0) {
            const stmt = db.prepare("INSERT INTO funcionarios (username, nome_completo) VALUES (?, ?)");
            stmt.run("r.pereira", "Ricardo Pereira");
            stmt.run("j.silva", "João Silva");
            stmt.finalize();
            console.log("-> Funcionários de teste criados (PIN inicial: 0000).");
        }
    });
});

module.exports = db;