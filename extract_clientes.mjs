import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import fs from "fs";

const db = drizzle(process.env.DATABASE_URL);

async function main() {
  const rows = await db.execute(sql`
    SELECT 
      c.id as clienteId,
      c.nomeCompleto,
      c.cpfCnpj,
      c.rg,
      c.profissao,
      c.cargo,
      c.orgaoEmpregador,
      c.vinculoFuncional,
      c.endereco,
      c.cidade,
      c.estado,
      c.nacionalidade,
      c.estadoCivil,
      p.numeroCnj,
      p.vara,
      p.tribunal,
      p.tipoAcao,
      p.faseAtual,
      p.statusProcesso
    FROM clientes c 
    LEFT JOIN processos p ON c.id = p.clienteId 
    WHERE c.tipoPessoa = 'PF'
    ORDER BY c.nomeCompleto, p.numeroCnj
  `);

  const data = rows[0] || rows;
  const clientes = {};
  for (const row of data) {
    const id = row.clienteId;
    if (!clientes[id]) {
      clientes[id] = {
        nomeCompleto: row.nomeCompleto,
        cpfCnpj: row.cpfCnpj,
        rg: row.rg,
        profissao: row.profissao,
        cargo: row.cargo,
        orgaoEmpregador: row.orgaoEmpregador,
        vinculoFuncional: row.vinculoFuncional,
        endereco: row.endereco,
        cidade: row.cidade,
        estado: row.estado,
        nacionalidade: row.nacionalidade,
        estadoCivil: row.estadoCivil,
        processos: []
      };
    }
    if (row.numeroCnj) {
      clientes[id].processos.push({
        numeroCnj: row.numeroCnj,
        vara: row.vara,
        tribunal: row.tribunal,
        tipoAcao: row.tipoAcao,
        faseAtual: row.faseAtual,
        statusProcesso: row.statusProcesso
      });
    }
  }

  fs.writeFileSync("/tmp/clientes_relatorio.json", JSON.stringify(Object.values(clientes), null, 2));
  console.log(`Total clientes PF: ${Object.keys(clientes).length}`);
  for (const [id, c] of Object.entries(clientes)) {
    console.log(`- ${c.nomeCompleto} | CPF: ${c.cpfCnpj} | Vínculo: ${c.vinculoFuncional} | Processos: ${c.processos.length}`);
    for (const p of c.processos) {
      const status = (p.statusProcesso || '').toLowerCase().includes('ativo') ? 'ATIVO' : 
                     (p.statusProcesso || '').toLowerCase().includes('inativo') ? 'INATIVO' : 
                     (p.statusProcesso || 'N/I');
      console.log(`  └ ${p.numeroCnj} | ${p.vara || 'N/I'} | ${p.tribunal || 'N/I'} | ${p.tipoAcao || 'N/I'} | ${status}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
