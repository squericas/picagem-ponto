# ⏱️ Picagem Ponto

Sistema web descentralizado e leve para gestão de horários, importação de escalas, registo de picagens em tempo real, edição autónoma de registos com auditoria e cálculo de saldos/desvios de tempo para estabelecimentos comerciais. Desenvolvido com Node.js, Express e SQLite, otimizado para deploy em servidores cloud (VPS Linux / Oracle Cloud).

---

## 🚀 Funcionalidades Principais

* **Autenticação Inteligente com PIN:** Criação automática de contas no primeiro acesso com PIN inicial (`0000`) e fluxo obrigatório de alteração segura de PIN.
* **Painel de Administração Exclusivo:** Gestão centralizada e importação exaustiva de escalas/turnos através de dados em formato JSON (suportando turnos repartidos e horários que cruzam a meia-noite).
* **Registo de Ponto em Tempo Real:** Validações instantâneas para entradas e saídas (bloqueio de picagens fora da janela permitida, prevenção de duplicações e cálculo imediato de atrasos ou horas extra).
* **Edição Autónoma & Apagar Picagens:** Os trabalhadores podem corrigir a hora de uma picagem ou apagar registos errados diretamente no portal pessoal.
* **Logs de Auditoria de Alterações:** Todas as edições, adições manuais e remoções de picagens ficam gravadas num registo inalterável de logs consultável pelo administrador em `/admin/logs`.
* **Portal do Funcionário:** Visualização do histórico de picagens reais, horários previstos e cálculo automático do saldo de horas de cada turno.
* **Exportação de Relatórios (Ciclo 26 a 26):** Exportação de relatórios individuais de horas trabalhadas em formato CSV (compatível com Excel/Google Sheets) abrangendo o ciclo mensal de 26 a 26.

---

## 🛠️ Tecnologias Utilizadas

* **Backend:** Node.js, Express, Express-Session
* **Base de Dados:** SQLite (`sqlite3`) com caminhos absolutos
* **Template Engine:** EJS (Embedded JavaScript Templates)
* **Gestor de Processos:** PM2
* **Infraestrutura / Acesso:** Cloudflare Tunnel / Reverse Proxy

---

## 📁 Estrutura do Projeto

```text
picagem-ponto/
├── views/                # Ficheiros de visualização EJS (portal, login, importar, logs)
│   ├── portal.ejs
│   ├── login.ejs
│   ├── alterar_pin.ejs
│   ├── importar.ejs
│   └── logs.ejs
├── database.js           # Configuração da base de dados e schemas SQLite
├── server.js             # Lógica do servidor, rotas e regras de negócio
├── package.json          # Dependências do projeto
└── ponto.db              # Base de dados SQLite (gerada automaticamente)
```

---

## ⚙️ Guia de Instalação e Execução na VPS

Siga os passos abaixo para configurar e colocar o projeto a funcionar num servidor Linux (Ubuntu/Debian VPS):

### 1. Atualizar o sistema e instalar dependências essenciais
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl sqlite3
```

### 2. Instalar o Node.js (Versão LTS)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Clonar o Repositório e Instalar Pacotes
```bash
git clone https://github.com/squericas/picagem-ponto.git
cd picagem-ponto
npm install
```

### 4. Instalar e Configurar o Gestor de Processos (PM2)
```bash
sudo npm install -g pm2
pm2 start server.js --name "ponto-app"
pm2 save
pm2 startup
```
*(Execute o comando emitido pelo `pm2 startup` para garantir que o serviço é iniciado automaticamente após um reboot da máquina).*

### 5. Verificar o Estado do Servidor
```bash
pm2 status
pm2 logs ponto-app --lines 20
```

A aplicação ficará a correr por predefinição na porta `3009`, pronta a ser ligada ao teu Cloudflare Tunnel ou Nginx.

---

## 🔐 Controlo de Acessos e Administração

* **Administrador Principal (`r.pereira`):**
  * Acesso exclusivo ao Painel de Importação de Escalas (`/admin/importar`).
  * Acesso à Tabela Global de Logs de Auditoria (`/admin/logs`).
  * Capacidade de exportar relatórios de qualquer colaborador.
* **Funcionários:**
  * Acesso restrito ao Portal Pessoal (`/portal`) para registo de ponto, correção de picagens próprias e descarregamento do seu relatório individual de 26 a 26.

---

## 📄 Licença

Este projeto é de uso privado e interno.