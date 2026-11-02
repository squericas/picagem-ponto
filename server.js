const express = require('express');
const session = require('express-session');
const db = require('./database');

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
    secret: 'segredo_ponto_paralelo',
    resave: false,
    saveUninitialized: false
}));
// Servir ficheiros estáticos
app.use(express.static('public'));
// Redirecionar raiz para o login
app.get('/', (req, res) => res.redirect('/login'));

// Middleware de Autenticação Geral
function autenticar(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.primeiro_acesso === 1) return res.redirect('/alterar-pin');
    next();
}

// Middleware para restringir a importação estritamente ao r.pereira
function apenasAdmin(req, res, next) {
    if (!req.session.user || req.session.user.username !== 'r.pereira') {
        return res.status(403).send("Acesso Negado. Apenas o utilizador r.pereira pode aceder a esta área.");
    }
    next();
}

// --- FUNÇÃO DE CÁLCULO DE TEMPO (Com suporte a fechos após meia-noite) ---
function calcularMinutosEntre(horaIni, horaFim, cruzaMeiaNoite = false) {
    const [h1, m1] = horaIni.split(':').map(Number);
    const [h2, m2] = horaFim.split(':').map(Number);
    let min1 = h1 * 60 + m1;
    let min2 = h2 * 60 + m2;
    if (cruzaMeiaNoite || min2 <= min1) {
        min2 += 24 * 60;
    }
    return min2 - min1;
}

// --- AUTENTICAÇÃO INTELIGENTE (Criação automática se PIN for 0000) ---
app.get('/login', (req, res) => res.render('login', { erro: null }));

app.post('/login', (req, res) => {
    const { username, pin } = req.body;
    const cleanUsername = username.trim().toLowerCase();

    db.get('SELECT * FROM funcionarios WHERE username = ?', [cleanUsername], (err, user) => {
        if (!user) {
            if (pin === '0000') {
                const partes = cleanUsername.split('.');
                const nomeFormatado = partes.length > 1 ? `${partes[0].toUpperCase()}. ${partes[1].charAt(0).toUpperCase() + partes[1].slice(1)}` : cleanUsername;

                db.run('INSERT INTO funcionarios (username, nome_completo, pin, primeiro_acesso) VALUES (?, ?, ?, 1)', 
                    [cleanUsername, nomeFormatado, '0000'], function(err) {
                        if (err) return res.render('login', { erro: 'Erro ao criar conta automática.' });
                        
                        db.get('SELECT * FROM funcionarios WHERE id = ?', [this.lastID], (err, novoUser) => {
                            req.session.user = novoUser;
                            return res.redirect('/alterar-pin');
                        });
                    });
            } else {
                return res.render('login', { erro: 'Utilizador não encontrado. Use o PIN 0000 no primeiro acesso.' });
            }
        } else {
            if (user.pin !== pin) {
                return res.render('login', { erro: 'PIN incorreto.' });
            }
            req.session.user = user;
            if (user.primeiro_acesso === 1 || user.pin === '0000') {
                return res.redirect('/alterar-pin');
            }
            res.redirect('/portal');
        }
    });
});

app.get('/alterar-pin', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('alterar_pin', { erro: null });
});

app.post('/alterar-pin', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { novo_pin } = req.body;
    if (!novo_pin || novo_pin.length < 4) {
        return res.render('alterar_pin', { erro: 'O PIN deve ter pelo menos 4 dígitos.' });
    }
    db.run('UPDATE funcionarios SET pin = ?, primeiro_acesso = 0 WHERE id = ?', [novo_pin, req.session.user.id], () => {
        req.session.user.primeiro_acesso = 0;
        req.session.user.pin = novo_pin;
        res.redirect('/portal');
    });
});

// --- ÁREA DE GESTÃO / IMPORTAÇÃO (Exclusivo r.pereira) ---
app.get('/admin/importar', apenasAdmin, (req, res) => {
    db.all(`
        SELECT h.*, f.nome_completo, f.username 
        FROM horarios_previstos h 
        JOIN funcionarios f ON h.funcionario_id = f.id 
        ORDER BY h.data DESC, h.entrada_prevista DESC
    `, [], (err, horarios) => {
        res.render('importar', { mensagem: null, erro: null, horarios: horarios || [] });
    });
});

app.post('/admin/importar', apenasAdmin, (req, res) => {
    try {
        const dados = JSON.parse(req.body.json_horario);
        const lista = Array.isArray(dados) ? dados : [dados];

        db.serialize(() => {
            lista.forEach(item => {
                const uName = item.username.trim().toLowerCase();
                const nomeCompleto = item.nome_completo || uName;
                const temRefeicao = item.refeicao ? 1 : 0;
                const entradaPrev = item.entrada_prevista;
                const saidaPrev = item.saida_prevista;

                db.get(`SELECT id FROM funcionarios WHERE username = ?`, [uName], (err, func) => {
                    if (!func) {
                        db.run(`INSERT INTO funcionarios (username, nome_completo, pin, primeiro_acesso) VALUES (?, ?, '0000', 1)`, 
                            [uName, nomeCompleto], function(err) {
                                if (!err) {
                                    inserirOuAtualizarTurno(this.lastID, item, temRefeicao, entradaPrev, saidaPrev);
                                }
                            });
                    } else {
                        inserirOuAtualizarTurno(func.id, item, temRefeicao, entradaPrev, saidaPrev);
                    }
                });
            });

            function inserirOuAtualizarTurno(funcId, item, temRefeicao, entradaPrev, saidaPrev) {
                db.get(`SELECT id FROM horarios_previstos WHERE funcionario_id = ? AND data = ? AND entrada_prevista = ?`, 
                    [funcId, item.data, entradaPrev], (err, existente) => {
                    if (existente) {
                        db.run(`UPDATE horarios_previstos SET saida_prevista = ?, refeicao = ?, pausa_minutos = ? WHERE id = ?`, 
                            [saidaPrev, temRefeicao, item.pausa_minutos || 0, existente.id]);
                    } else {
                        db.run(`INSERT INTO horarios_previstos (funcionario_id, data, entrada_prevista, saida_prevista, refeicao, pausa_minutos) VALUES (?, ?, ?, ?, ?, ?)`, 
                            [funcId, item.data, entradaPrev, saidaPrev, temRefeicao, item.pausa_minutos || 0]);
                    }
                });
            }

            setTimeout(() => {
                db.all(`
                    SELECT h.*, f.nome_completo, f.username 
                    FROM horarios_previstos h 
                    JOIN funcionarios f ON h.funcionario_id = f.id 
                    ORDER BY h.data DESC, h.entrada_prevista DESC
                `, [], (err, horarios) => {
                    res.render('importar', { mensagem: `Escala exaustiva importada com sucesso!`, erro: null, horarios: horarios || [] });
                });
            }, 200);
        });

    } catch (e) {
        db.all(`
            SELECT h.*, f.nome_completo, f.username 
            FROM horarios_previstos h 
            JOIN funcionarios f ON h.funcionario_id = f.id 
            ORDER BY h.data DESC, h.entrada_prevista DESC
        `, [], (err, horarios) => {
            res.render('importar', { mensagem: null, erro: 'JSON inválido. Verifica a estrutura gerada pela LLM.', horarios: horarios || [] });
        });
    }
});

app.post('/admin/horario/apagar/:id', apenasAdmin, (req, res) => {
    db.run('DELETE FROM horarios_previstos WHERE id = ?', [req.params.id], () => {
        res.redirect('/admin/importar');
    });
});

app.post('/admin/horarios/apagar-todos', apenasAdmin, (req, res) => {
    db.run('DELETE FROM horarios_previstos', [], () => {
        res.redirect('/admin/importar');
    });
});

app.post('/admin/horario/editar/:id', apenasAdmin, (req, res) => {
    const { data, entrada_prevista, saida_prevista, refeicao, pausa_minutos } = req.body;
    db.run(
        'UPDATE horarios_previstos SET data = ?, entrada_prevista = ?, saida_prevista = ?, refeicao = ?, pausa_minutos = ? WHERE id = ?',
        [data, entrada_prevista, saida_prevista, refeicao ? 1 : 0, pausa_minutos || 0, req.params.id],
        () => res.redirect('/admin/importar')
    );
});

app.get('/admin/logs', apenasAdmin, (req, res) => {
    db.all(`
        SELECT l.*, f.nome_completo, f.username 
        FROM logs_alteracoes l 
        JOIN funcionarios f ON l.funcionario_id = f.id 
        ORDER BY l.timestamp DESC LIMIT 100
    `, [], (err, logs) => {
        res.render('logs', { logs: logs || [] });
    });
});

// --- PORTAL DO FUNCIONÁRIO ---
app.get('/portal', autenticar, (req, res) => {
    const userId = req.session.user.id;

    db.all('SELECT * FROM picagens WHERE funcionario_id = ? ORDER BY id DESC LIMIT 15', [userId], (err, picagens) => {
        db.all('SELECT * FROM horarios_previstos WHERE funcionario_id = ? ORDER BY data DESC, entrada_prevista DESC LIMIT 15', [userId], (err, previstos) => {
            
            const resumo = (previstos || []).map(hp => {
                const picagensDia = (picagens || []).filter(p => p.timestamp.startsWith(hp.data));
                const entrada = picagensDia.find(p => p.tipo === 'ENTRADA');
                const saida = picagensDia.find(p => p.tipo === 'SAIDA');

                let realStr = "Sem registo completo";
                let desvioMin = 0;
                let desvioFmt = "N/A";

                if (entrada && saida) {
                    const horaEntradaReal = entrada.timestamp.substring(11, 16);
                    const horaSaidaReal = saida.timestamp.substring(11, 16);
                    realStr = `${horaEntradaReal} - ${horaSaidaReal}`;

                    const [hEntPrev, mEntPrev] = hp.entrada_prevista.split(':').map(Number);
                    const [hSaiPrev, mSaiPrev] = hp.saida_prevista.split(':').map(Number);
                    const turnoPassaMeiaNoite = (hSaiPrev * 60 + mSaiPrev) <= (hEntPrev * 60 + mEntPrev);

                    const descontoRefeicao = hp.refeicao === 1 ? 30 : 0;
                    const minPrevistos = calcularMinutosEntre(hp.entrada_prevista, hp.saida_prevista, turnoPassaMeiaNoite) - (hp.pausa_minutos || 0) - descontoRefeicao;
                    const minReais = calcularMinutosEntre(horaEntradaReal, horaSaidaReal, turnoPassaMeiaNoite) - (hp.pausa_minutos || 0) - descontoRefeicao;

                    desvioMin = minReais - minPrevistos;
                    const horas = Math.floor(Math.abs(desvioMin) / 60);
                    const mins = Math.abs(desvioMin) % 60;
                    desvioFmt = `${horas}h ${mins}m`;
                }

                return {
                    data: hp.data,
                    previsto: `${hp.entrada_prevista} - ${hp.saida_prevista} ${hp.refeicao === 1 ? '(Com Refeição)' : '(Sem Refeição)'}`,
                    real: realStr,
                    minutos_desvio: desvioMin,
                    desvio_formatado: desvioFmt
                };
            });

            res.render('portal', { user: req.session.user, picagens: picagens || [], resumo });
        });
    });
});

// --- GESTÃO DE PICAGENS PELO UTILIZADOR (Adicionar, Editar, Apagar) ---
app.post('/portal/adicionar-picagem', autenticar, (req, res) => {
    const { data, tipo, hora } = req.body;
    const userId = req.session.user.id;

    if (!data || !tipo || !hora) {
        return res.send(`<script>alert('Preencha todos os campos para adicionar a picagem.'); window.location.href='/portal';</script>`);
    }

    const timestampCompleto = `${data} ${hora}:00`;

    db.run('INSERT INTO picagens (funcionario_id, tipo, timestamp) VALUES (?, ?, ?)', [userId, tipo, timestampCompleto], function(err) {
        if (err) {
            return res.send(`<script>alert('Erro ao adicionar picagem.'); window.location.href='/portal';</script>`);
        }

        const detalhesLog = `Utilizador ${req.session.user.username} adicionou picagem manual: ${tipo} a ${timestampCompleto}`;
        db.run('INSERT INTO logs_alteracoes (funcionario_id, admin_ou_user, acao, detalhes) VALUES (?, ?, ?, ?)',
            [userId, req.session.user.username, 'ADICIONOU_PICAGEM', detalhesLog]);

        res.send(`<script>alert('Picagem adicionada com sucesso!'); window.location.href='/portal';</script>`);
    });
});

app.post('/portal/editar-picagem', autenticar, (req, res) => {
    const { picagem_id, novo_tipo, nova_hora } = req.body;
    const userId = req.session.user.id;

    db.get('SELECT * FROM picagens WHERE id = ? AND funcionario_id = ?', [picagem_id, userId], (err, picagem) => {
        if (!picagem) {
            return res.send(`<script>alert('Erro: Picagem não encontrada ou sem permissão.'); window.location.href='/portal';</script>`);
        }

        const dataOriginal = picagem.timestamp.split(' ')[0];
        const novoTimestamp = `${dataOriginal} ${nova_hora}:00`;

        db.run('UPDATE picagens SET tipo = ?, timestamp = ? WHERE id = ?', [novo_tipo, novoTimestamp, picagem_id], (err) => {
            if (err) {
                return res.send(`<script>alert('Erro ao atualizar picagem.'); window.location.href='/portal';</script>`);
            }

            const detalhesLog = `Utilizador ${req.session.user.username} alterou picagem ID ${picagem_id} de '${picagem.tipo} (${picagem.timestamp})' para '${novo_tipo} (${novoTimestamp})'`;
            db.run('INSERT INTO logs_alteracoes (funcionario_id, admin_ou_user, acao, detalhes) VALUES (?, ?, ?, ?)',
                [userId, req.session.user.username, 'EDITOU_PICAGEM', detalhesLog]);

            res.send(`<script>alert('Picagem atualizada com sucesso!'); window.location.href='/portal';</script>`);
        });
    });
});

app.post('/portal/apagar-picagem', autenticar, (req, res) => {
    const { picagem_id } = req.body;
    const userId = req.session.user.id;

    db.get('SELECT * FROM picagens WHERE id = ? AND funcionario_id = ?', [picagem_id, userId], (err, picagem) => {
        if (!picagem) {
            return res.send(`<script>alert('Erro: Picagem não encontrada ou sem permissão.'); window.location.href='/portal';</script>`);
        }

        db.run('DELETE FROM picagens WHERE id = ?', [picagem_id], (err) => {
            if (err) {
                return res.send(`<script>alert('Erro ao apagar picagem.'); window.location.href='/portal';</script>`);
            }

            const detalhesLog = `Utilizador ${req.session.user.username} apagou picagem ID ${picagem_id} (${picagem.tipo} - ${picagem.timestamp})`;
            db.run('INSERT INTO logs_alteracoes (funcionario_id, admin_ou_user, acao, detalhes) VALUES (?, ?, ?, ?)',
                [userId, req.session.user.username, 'APAGOU_PICAGEM', detalhesLog]);

            res.send(`<script>alert('Picagem apagada com sucesso!'); window.location.href='/portal';</script>`);
        });
    });
});

// --- VALIDAÇÕES E FEEDBACK INSTANTÂNEO DE PICAGEM ---
app.post('/picar', autenticar, (req, res) => {
    const { tipo } = req.body;
    const userId = req.session.user.id;
    
    const agoraCompleto = new Date();
    const dataHoje = agoraCompleto.toISOString().split('T')[0];
    const horaAtualStr = agoraCompleto.toTimeString().substring(0, 5);
    const timestampCompleto = agoraCompleto.toISOString().replace('T', ' ').substring(0, 19);

    db.get('SELECT * FROM horarios_previstos WHERE funcionario_id = ? AND data = ?', [userId, dataHoje], (err, horarioPrevisto) => {
        db.all('SELECT * FROM picagens WHERE funcionario_id = ? AND timestamp LIKE ? ORDER BY id DESC', [userId, `${dataHoje}%`], (err, picagensHoje) => {
            
            const ultimaPicagem = picagensHoje && picagensHoje.length > 0 ? picagensHoje[0] : null;

            if (tipo === 'SAIDA') {
                if (!ultimaPicagem || ultimaPicagem.tipo === 'SAIDA') {
                    return res.send(`<script>alert('Erro: Não podes registar Saída sem teres registado uma Entrada primeiro!'); window.location.href='/portal';</script>`);
                }
            }

            if (tipo === 'ENTRADA') {
                if (ultimaPicagem && ultimaPicagem.tipo === 'ENTRADA') {
                    return res.send(`<script>alert('Erro: Já tens uma Entrada registada sem Saída correspondente!'); window.location.href='/portal';</script>`);
                }

                if (horarioPrevisto) {
                    const [hPrev, mPrev] = horarioPrevisto.entrada_prevista.split(':').map(Number);
                    const [hAtu, mAtu] = horaAtualStr.split(':').map(Number);

                    let minPrevistos = hPrev * 60 + mPrev;
                    let minAtuais = hAtu * 60 + mAtu;

                    if (minAtuais < (minPrevistos - 10)) {
                        return res.send(`<script>alert('Erro: Só podes picar a entrada até 10 minutos antes da tua hora prevista (${horarioPrevisto.entrada_prevista}).'); window.location.href='/portal';</script>`);
                    }
                }
            }

            let mensagemFeedback = `Picagem de ${tipo} registada com sucesso às ${horaAtualStr}!`;

            if (tipo === 'ENTRADA' && horarioPrevisto) {
                const [hPrev, mPrev] = horarioPrevisto.entrada_prevista.split(':').map(Number);
                const [hAtu, mAtu] = horaAtualStr.split(':').map(Number);
                const totalMinPrev = hPrev * 60 + mPrev;
                const totalMinAtu = hAtu * 60 + mAtu;
                const diferenca = totalMinAtu - totalMinPrev;

                if (diferenca > 0) {
                    mensagemFeedback = `Entrada registada! Chegaste ${diferenca} minutos atrasado.`;
                } else if (diferenca < 0) {
                    mensagemFeedback = `Entrada registada! Chegaste ${Math.abs(diferenca)} minutos adiantado.`;
                } else {
                    mensagemFeedback = `Entrada registada exatamente a horas!`;
                }
            }

            if (tipo === 'SAIDA' && horarioPrevisto && ultimaPicagem) {
                const horaEntradaReal = ultimaPicagem.timestamp.substring(11, 16);
                const [hEntPrev, mEntPrev] = horarioPrevisto.entrada_prevista.split(':').map(Number);
                const [hSaiPrev, mSaiPrev] = horarioPrevisto.saida_prevista.split(':').map(Number);
                const turnoPassaMeiaNoite = (hSaiPrev * 60 + mSaiPrev) <= (hEntPrev * 60 + mEntPrev);

                const descontoRefeicao = horarioPrevisto.refeicao === 1 ? 30 : 0;
                const minPrevistos = calcularMinutosEntre(horarioPrevisto.entrada_prevista, horarioPrevisto.saida_prevista, turnoPassaMeiaNoite) - (horarioPrevisto.pausa_minutos || 0) - descontoRefeicao;
                const minReais = calcularMinutosEntre(horaEntradaReal, horaAtualStr, turnoPassaMeiaNoite) - (horarioPrevisto.pausa_minutos || 0) - descontoRefeicao;
                
                const desvioMin = minReais - minPrevistos;

                if (desvioMin > 0) {
                    const h = Math.floor(desvioMin / 60);
                    const m = desvioMin % 60;
                    mensagemFeedback = `Saída registada! Ficaste ${h > 0 ? h + 'h ' : ''}${m}m a mais (Horas Extra).`;
                } else if (desvioMin < 0) {
                    const h = Math.floor(Math.abs(desvioMin) / 60);
                    const m = Math.abs(desvioMin) % 60;
                    mensagemFeedback = `Saída registada! Saíste ${h > 0 ? h + 'h ' : ''}${m}m mais cedo (Horas em falta).`;
                } else {
                    mensagemFeedback = `Saída registada! Cumpriste exatamente o horário previsto.`;
                }
            }

            db.run('INSERT INTO picagens (funcionario_id, tipo, timestamp) VALUES (?, ?, ?)', [userId, tipo, timestampCompleto], () => {
                res.send(`<script>alert('${mensagemFeedback}'); window.location.href='/portal';</script>`);
            });
        });
    });
});

// --- EXPORTAÇÃO DE HORAS INDIVIDUAL (Ciclo 26 a 26) ---
app.get('/exportar-horas', autenticar, (req, res) => {
    const isAdm = req.session.user.username === 'r.pereira';
    const funcionarioId = (isAdm && req.query.funcionario_id) ? req.query.funcionario_id : req.session.user.id;

    const hoje = new Date();
    const ano = parseInt(req.query.ano) || hoje.getFullYear();
    const mes = parseInt(req.query.mes) || (hoje.getMonth() + 1);

    const mesAnterior = mes === 1 ? 12 : mes - 1;
    const anoAnterior = mes === 1 ? ano - 1 : ano;

    const dataInicio = `${anoAnterior}-${String(mesAnterior).padStart(2, '0')}-26`;
    const dataFim = `${ano}-${String(mes).padStart(2, '0')}-26`;

    db.get('SELECT * FROM funcionarios WHERE id = ?', [funcionarioId], (err, func) => {
        if (!func) return res.status(404).send("Funcionário não encontrado.");

        db.all(`
            SELECT h.* FROM horarios_previstos h 
            WHERE h.funcionario_id = ? AND h.data BETWEEN ? AND ?
            ORDER BY h.data ASC, h.entrada_prevista ASC
        `, [funcionarioId, dataInicio, dataFim], (err, horarios) => {
            
            db.all(`
                SELECT * FROM picagens 
                WHERE funcionario_id = ? AND timestamp >= ? AND timestamp <= ?
            `, [funcionarioId, `${dataInicio} 00:00:00`, `${dataFim} 23:59:59`], (err, picagens) => {

                let csvContent = `Relatorio de Horas - ${func.nome_completo} (@${func.username})\n`;
                csvContent += `Periodo: ${dataInicio} a ${dataFim}\n\n`;
                csvContent += "Data;Entrada Prevista;Saida Prevista;Entrada Real;Saida Real;Refeicao;Saldo (Horas)\n";

                (horarios || []).forEach(hp => {
                    const picagensDia = (picagens || []).filter(p => p.timestamp.startsWith(hp.data));
                    const entrada = picagensDia.find(p => p.tipo === 'ENTRADA');
                    const saida = picagensDia.find(p => p.tipo === 'SAIDA');

                    let realEntrada = "-";
                    let realSaida = "-";
                    let desvioFmt = "Falta Registo";

                    if (entrada && saida) {
                        realEntrada = entrada.timestamp.substring(11, 16);
                        realSaida = saida.timestamp.substring(11, 16);

                        const [hEntPrev, mEntPrev] = hp.entrada_prevista.split(':').map(Number);
                        const [hSaiPrev, mSaiPrev] = hp.saida_prevista.split(':').map(Number);
                        const turnoPassaMeiaNoite = (hSaiPrev * 60 + mSaiPrev) <= (hEntPrev * 60 + mEntPrev);

                        const descontoRefeicao = hp.refeicao === 1 ? 30 : 0;
                        const minPrevistos = calcularMinutosEntre(hp.entrada_prevista, hp.saida_prevista, turnoPassaMeiaNoite) - (hp.pausa_minutos || 0) - descontoRefeicao;
                        const minReais = calcularMinutosEntre(realEntrada, realSaida, turnoPassaMeiaNoite) - (hp.pausa_minutos || 0) - descontoRefeicao;

                        const desvioMin = minReais - minPrevistos;
                        const sinal = desvioMin > 0 ? '+' : (desvioMin < 0 ? '-' : '');
                        const horas = Math.floor(Math.abs(desvioMin) / 60);
                        const mins = Math.abs(desvioMin) % 60;
                        desvioFmt = `${sinal}${horas}h ${mins}m`;
                    }

                    const refeicaoStr = hp.refeicao === 1 ? 'Sim' : 'Nao';
                    csvContent += `"${hp.data}";"${hp.entrada_prevista}";"${hp.saida_prevista}";"${realEntrada}";"${realSaida}";"${refeicaoStr}";"${desvioFmt}"\n`;
                });

                res.header('Content-Type', 'text/csv; charset=utf-8');
                res.attachment(`relatorio_${func.username}_${dataInicio}_a_${dataFim}.csv`);
                res.send('\uFEFF' + csvContent);
            });
        });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

const PORT = process.env.PORT || 3009;
app.listen(PORT, () => console.log(`Servidor de pé na porta ${PORT}`));