# ⏱️ Picagem Ponto

Sistema web descentralizado e leve para gestão de horários, importação de escalas, registo de picagens em tempo real e cálculo de saldos/desvios de tempo para estabelecimentos comerciais. Desenvolvido com Node.js, Express e SQLite, otimizado para deploy em servidores cloud (VPS Linux / Oracle Cloud).

---

## 🚀 Funcionalidades Principais

* **Autenticação Inteligente com PIN:** Criação automática de contas no primeiro acesso com PIN inicial (`0000`) e fluxo obrigatório de alteração segura de PIN.
* **Painel de Administração Exclusivo:** Gestão centralizada e importação exaustiva de escalas/turnos através de dados em formato JSON (suportando turnos repartidos e horários que cruzam a meia-noite).
* **Registo de Ponto em Tempo Real:** Validações instantâneas para entradas e saídas (bloqueio de picagens fora da janela permitida, prevenção de duplicações e cálculo imediato de atrasos ou horas extra).
* **Portal do Funcionário:** Visualização do histórico de picagens, horários previstos e cálculo automático do saldo de horas de cada turno.
* **Exportação de Relatórios (Ciclo 26 a 26):** Funcionalidade para exportar o relatório individual de horas trabalhadas em formato CSV (compatível com Excel/Google Sheets) considerando o período de faturação/gestão de 26 a 26 de cada mês.

---

## 🛠️ Tecnologias Utilizadas

* **Backend:** Node.js, Express, Express-Session
* **Base de Dados:** SQLite (`sqlite3`) com caminhos absolutos
* **Template Engine:** EJS (Embedded JavaScript Templates)
* **Gestor de Processos:** PM2
* **Infraestrutura / Acesso:** Cloudflare Tunnel

---

## 📁 Estrutura do Projeto

```text
picagem-ponto/
├── views/                # Ficheiros de visualização EJS (portal, login, admin)
├── database.js           # Configuração da base de dados e criação de tabelas
├── server.js             # Lógica principal do servidor, rotas e regras de negócio
├── package.json          # Dependências do projeto
└── ponto.db              # Base de dados SQLite (gerada automaticamente)