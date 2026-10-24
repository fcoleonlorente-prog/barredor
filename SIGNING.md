# Firma digital y publicación

La publicación de Windows está en `.github/workflows/release.yml`.

- Si `SIGNPATH_ORGANIZATION_ID` no está configurado, publica una versión de prueba **sin firma digital**, indicada como tal en las notas.
- Si esa variable está configurada, exige el paso de SignPath y comprueba la firma en Windows antes de publicar. Un fallo no se convierte en una publicación sin firma.
- Mantiene el secret `SIGNPATH_API_TOKEN`, proyecto `barredor` y política `release-signing` de la configuración original. Solo el titular debe introducir las credenciales en GitHub y gestionar las aprobaciones necesarias en SignPath.
- `SHA256SUMS.txt` se genera después de seleccionar el archivo final, firmado o sin firmar.

Para habilitar la firma, solicita el programa de SignPath Foundation en https://signpath.org y completa su proceso de aprobación; no se presupone que la solicitud esté aprobada ni que todos sus requisitos estén satisfechos.

Para publicar otra versión, incrementa `version` en `package.json` y sube el cambio a `main`, o ejecuta el flujo desde Actions. No se sobrescribe una publicación existente.
