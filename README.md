# Sistema de Registo de Ponto (Paralelo)

Sistema web de ponto e gestão de horários desenvolvido em **Node.js**, **Express**, **SQLite** e **EJS**, com suporte a ciclos de apuramento (26 a 26), logs de auditoria e modo noturno global.

---

## 🛠️ Tecnologias Utilizadas
* **Backend:** Node.js, Express
* **Base de Dados:** SQLite (`sqlite3`)
* **Sessões e Segurança:** `express-session`, `bcrypt` (para encriptação de palavras-passe)
* **Frontend:** EJS (Embedded JavaScript Templates), CSS com suporte a variáveis dinâmicas para Dark/Light Mode
* **Process Manager:** PM2

---

## 👥 Contas e Níveis de Acesso

* **Administrador (`gestor_app`):** Conta com privilégios exclusivos para gestão de horários, importação de escalas via JSON/LLM e consulta de logs de auditoria de alterações.
* **Funcionários (ex: `r.pereira`):** Contas individuais para registo de ponto (entrada/saída), consulta de resumos de desvios, pedidos de acerto de picagens e exportação individual de relatórios.

---

## 🔑 Criar a Conta Administradora (`gestor_app`)

As senhas do sistema são guardadas de forma segura com encriptação `bcrypt`. Para criar ou redefinir a conta administrativa `gestor_app` diretamente na base de dados, executa o comando abaixo no terminal da VPS (na pasta raiz do projeto):

```bash
node -e "
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./ponto.db');

bcrypt.hash('TUA_SENHA_SEGURA', 10, (err, hash) => {
    db.run(\"INSERT OR REPLACE INTO funcionarios (username, nome_completo, pin, primeiro_acesso) VALUES ('gestor_app', 'Gestor da Aplicação', ?, 0)\", [hash], () => {
        console.log('Conta gestor_app criada/atualizada com sucesso!');
        db.close();
    });
});
"
```

*(Substitui `'TUA_SENHA_SEGURA'` pela palavra-passe que pretendes atribuir ao gestor).*

---

## 🔒 Segurança e Encriptação Retroativa

* Novas contas criadas (manualmente ou via importação de escala) têm o PIN padrão `'0000'` encriptado com `bcrypt`.
* A aplicação possui **migração automática de senhas em texto plano**: se um utilizador antigo com a palavra-passe não encriptada fizer login, a aplicação valida a credencial e converte-a de imediato num hash `bcrypt` na base de dados.

---

## 🚀 Instalação e Execução na VPS

1. **Atualizar o código no servidor:**
   ```bash
   git pull origin main
   ```

2. **Instalar dependências:**
   ```bash
   npm install
   ```

3. **Iniciar/Reiniciar a aplicação no PM2:**
   ```bash
   pm2 delete ponto-app
   pm2 start server.js --name ponto-app
   pm2 save
   ```

---

## 📄 Funcionalidades Principais

1. **Modo Noturno Global:** Suporte a alternância clara/escura persistida no navegador via `localStorage`.
2. **Importação Inteligente de Escalas:** Leitura e inserção em lote via JSON de escalas enviadas pelo LLM.
3. **Auditoria (`logs_alteracoes`):** Registos detalhados de adições, edições e remoções de picagens efetuadas pelos utilizadores.
4. **Ciclo de Relatório (26 a 26):** Exportação de relatórios em ficheiro CSV calculando saldos de horas entre os dias 26 de meses consecutivos.