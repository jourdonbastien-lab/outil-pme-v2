# Dépôt des documents Ricoh vers OutilPME

OutilPME surveille le dossier suivant sur le VPS :

```text
/opt/outil-pme-v2/storage/scanner/incoming
```

Le processus Node/PM2 doit pouvoir lire, déplacer et supprimer les fichiers dans `incoming` et écrire dans les autres sous-dossiers de `storage/scanner`. Le compte de dépôt ne doit avoir accès qu’au dossier `incoming`.

## Compte recommandé

Créer un compte système dédié, par exemple `outilpme-scanner`, sans shell interactif. Utiliser un groupe partagé avec le compte exécutant OutilPME et des permissions restrictives (`2770` sur les dossiers, `0660` sur les fichiers). Vérifier les identités réellement utilisées par PM2 avant d’appliquer les permissions.

Le script `scripts/prepare-scanner-directory.sh` prépare uniquement l’arborescence. Il n’ouvre aucun port et n’installe aucun serveur réseau.

## Transport à retenir

Ne jamais exposer SMB/port 445 sur Internet : ce protocole augmente fortement la surface d’attaque et n’est pas destiné à une publication directe.

Selon les capacités exactes de la Ricoh IM C300, étudier dans cet ordre :

1. SFTP avec compte enfermé dans un répertoire dédié ;
2. FTPS avec chiffrement obligatoire ;
3. FTP isolé et strictement limité si aucun protocole chiffré n’est disponible ;
4. VPN site-à-site avant tout usage de SMB ;
5. relais local sur un PC ou un NAS, qui transfère ensuite les fichiers par SFTP.

La configuration du protocole, du pare-feu et de l’imprimante doit faire l’objet d’une intervention séparée après validation réseau.

## Variables OutilPME

```text
SCANNER_IMPORT_ENABLED=true
SCANNER_IMPORT_INTERVAL_MS=10000
SCANNER_MAX_FILE_SIZE_MB=25
```

Après déploiement, vérifier les logs PM2 préfixés `[scanner-import]`, déposer un PDF de test non sensible, puis confirmer son apparition dans `/documents-entrants` avant de configurer la Ricoh.
