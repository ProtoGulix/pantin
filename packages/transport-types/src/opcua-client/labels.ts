import type { TransportLabels } from "../schema-common.ts";
import type { OPCUA_IEC_TYPES } from "./iec-types.ts";
import type { SECURITY_MODES, SECURITY_POLICIES } from "./schema.ts";

// What the user reads; the setting and field names themselves stay in English (ADR 0064).
type OpcuaSetting =
  | "key"
  | "port"
  | "endpointPath"
  | "securityMode"
  | "securityPolicy"
  | "auth"
  | "userName"
  | "namespaceUri"
  | "nodeIdPrefix"
  | "gvlName"
  | "samplingMilliseconds"
  | "publishingMilliseconds"
  | "watchdogMilliseconds";
type OpcuaField = "identifier" | "resolvedIdentifier" | "iecType";
type OpcuaValue =
  | (typeof SECURITY_MODES)[number]
  | Exclude<(typeof SECURITY_POLICIES)[number], "None">
  | (typeof OPCUA_IEC_TYPES)[number]
  | "anonymous"
  | "user"
  | "derived"
  | "explicit";

export const OPCUA_CLIENT_LABELS = {
  en: {
    name: "OPC UA client",
    settings: {
      key: "Key",
      port: "Port",
      endpointPath: "Endpoint path",
      securityMode: "Security mode",
      securityPolicy: "Security policy",
      auth: "Authentication",
      userName: "User name",
      namespaceUri: "Namespace URI",
      nodeIdPrefix: "NodeId prefix",
      gvlName: "GVL name",
      samplingMilliseconds: "Sampling (ms)",
      publishingMilliseconds: "Publishing (ms)",
      watchdogMilliseconds: "Watchdog (ms)",
    },
    channelFields: {
      identifier: "Identifier",
      resolvedIdentifier: "Node",
      iecType: "Type",
    },
    values: {
      None: "None",
      Sign: "Sign",
      SignAndEncrypt: "Sign and encrypt",
      Basic256Sha256: "Basic256Sha256",
      Aes128_Sha256_RsaOaep: "Aes128_Sha256_RsaOaep",
      Aes256_Sha256_RsaPss: "Aes256_Sha256_RsaPss",
      BOOL: "BOOL",
      REAL: "REAL",
      LREAL: "LREAL",
      INT: "INT",
      DINT: "DINT",
      LINT: "LINT",
      anonymous: "Anonymous",
      user: "User and password",
      derived: "derived",
      explicit: "explicit",
    },
  },
  fr: {
    name: "Client OPC UA",
    settings: {
      key: "Clé",
      port: "Port",
      endpointPath: "Chemin du point d'accès",
      securityMode: "Mode de sécurité",
      securityPolicy: "Politique de sécurité",
      auth: "Authentification",
      userName: "Nom d'utilisateur",
      namespaceUri: "URI de l'espace de noms",
      nodeIdPrefix: "Préfixe du NodeId",
      gvlName: "Nom de la GVL",
      samplingMilliseconds: "Échantillonnage (ms)",
      publishingMilliseconds: "Publication (ms)",
      watchdogMilliseconds: "Chien de garde (ms)",
    },
    channelFields: {
      identifier: "Identifiant",
      resolvedIdentifier: "Noeud",
      iecType: "Type",
    },
    values: {
      None: "Aucune",
      Sign: "Signer",
      SignAndEncrypt: "Signer et chiffrer",
      Basic256Sha256: "Basic256Sha256",
      Aes128_Sha256_RsaOaep: "Aes128_Sha256_RsaOaep",
      Aes256_Sha256_RsaPss: "Aes256_Sha256_RsaPss",
      BOOL: "BOOL",
      REAL: "REAL",
      LREAL: "LREAL",
      INT: "INT",
      DINT: "DINT",
      LINT: "LINT",
      anonymous: "Anonyme",
      user: "Utilisateur et mot de passe",
      derived: "dérivé",
      explicit: "explicite",
    },
  },
} satisfies Record<"en" | "fr", TransportLabels<OpcuaSetting, OpcuaField, OpcuaValue>>;
