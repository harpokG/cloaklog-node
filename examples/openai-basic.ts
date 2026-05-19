import {
  decryptContentWithKey,
  decryptDataKey,
  generateKeyPair,
} from '../src/core/crypto.ts';
import { wrapOpenAI, type EncryptedField, type EncryptedLogPayload } from '../src/adapters/openai.ts';

type MockCreateParams = {
  model: string;
  messages: Array<{ role: string; content: string }>;
};

type MockCreateResponse = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: 'stop';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const ansi = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  gray: '\u001b[90m',
};

function section(title: string): void {
  const line = '═'.repeat(80);
  console.log(`\n${ansi.cyan}${line}${ansi.reset}`);
  console.log(`${ansi.bold}${ansi.cyan}${title}${ansi.reset}`);
  console.log(`${ansi.cyan}${line}${ansi.reset}`);
}

function asEncryptedField(value: unknown): EncryptedField {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected encrypted field object');
  }

  if (!("_cloaklog" in value) || !("payload" in value)) {
    throw new Error('Invalid encrypted field structure');
  }

  return value as EncryptedField;
}

function assertCapturedLog(log: EncryptedLogPayload | null): EncryptedLogPayload {
  if (log === null) {
    throw new Error('No encrypted log was captured');
  }

  return log;
}

async function runDemo(): Promise<void> {
  section('CLOAKLOG DEMO — ENTREPRISE: LOG LLM CHIFFRÉ AVANT OBSERVABILITÉ');

  const { publicKey, privateKey } = await generateKeyPair();
  console.log(`${ansi.green}✓${ansi.reset} Paire de clés RSA générée à la volée (PEM)`);
  console.log(`${ansi.gray}Public key prefix:${ansi.reset} ${publicKey.slice(0, 42)}...`);

  const mockOpenAI = {
    chat: {
      completions: {
        create: async (...args: any[]): Promise<MockCreateResponse> => ({
          model: (args[0] as MockCreateParams).model,
          id: 'chatcmpl_demo_001',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Traitement terminé. Dossier client validé pour le compte 123456789.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 31,
            completion_tokens: 17,
            total_tokens: 48,
          },
        }),
      },
    },
  };

  let capturedLog: EncryptedLogPayload | null = null;

  const wrappedOpenAI = wrapOpenAI(mockOpenAI, publicKey, {
    onLog: (log) => {
      capturedLog = log;

      section('LOG CHIFFRÉ ENVOYÉ PAR L’ENTREPRISE');
      console.log(`${ansi.yellow}Payload observabilité (aucun texte sensible en clair):${ansi.reset}`);
      console.log(JSON.stringify(log, null, 2));

      const serialized = JSON.stringify(log);
      const leakedPlaintext = serialized.includes('Le compte bancaire de M. Dupont est le 123456789');

      console.log(`\n${ansi.bold}Vérification fuite plaintext:${ansi.reset} ${leakedPlaintext ? `${ansi.red}ÉCHEC${ansi.reset}` : `${ansi.green}OK${ansi.reset}`}`);
      console.log(`${ansi.bold}Métadonnées en clair:${ansi.reset}`);
      console.log(`- model: ${log.metadata.model}`);
      console.log(`- usage.total_tokens: ${log.metadata.usage?.total_tokens ?? 'n/a'}`);
      console.log(`- latencyMs: ${log.metadata.latencyMs}`);
    },
  });

  const ultraSensitiveText = 'Le compte bancaire de M. Dupont est le 123456789';

  section('APPEL LLM (MOCK) AVEC DONNÉE ULTRA-SENSIBLE');
  console.log(`${ansi.red}Entrée sensible:${ansi.reset} ${ultraSensitiveText}`);

  await wrappedOpenAI.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: ultraSensitiveText,
      },
    ],
  });

  const log = assertCapturedLog(capturedLog);

  section('DÉCHIFFREMENT CÔTÉ ENTREPRISE (PREUVE DE RÉVERSIBILITÉ)');

  const dataKey = decryptDataKey(log.encryptedKey, privateKey);
  const encryptedRequestContent = asEncryptedField((log.request.messages as Array<{ content: unknown }>)[0]?.content);
  const encryptedResponseContent = asEncryptedField(
    (log.response.choices as Array<{ message: { content: unknown } }>)[0]?.message.content,
  );

  const decryptedRequest = decryptContentWithKey(encryptedRequestContent.payload, dataKey);
  const decryptedResponse = decryptContentWithKey(encryptedResponseContent.payload, dataKey);

  console.log(`${ansi.green}✓ Requête déchiffrée:${ansi.reset} ${decryptedRequest}`);
  console.log(`${ansi.green}✓ Réponse déchiffrée:${ansi.reset} ${decryptedResponse}`);

  section('RÉSUMÉ');
  console.log(`${ansi.green}✓${ansi.reset} Texte sensible chiffré localement avant log`);
  console.log(`${ansi.green}✓${ansi.reset} Métadonnées observabilité conservées en clair`);
  console.log(`${ansi.green}✓${ansi.reset} Donnée récupérable uniquement avec clé privée`);
}

runDemo().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n${ansi.red}Demo failed:${ansi.reset} ${message}`);
  process.exitCode = 1;
});
