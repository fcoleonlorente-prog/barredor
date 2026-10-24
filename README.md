# Barredor

Desinstalador de programas para Windows con limpieza de restos (carpetas, archivos y claves del registro). App de escritorio hecha con Electron.

## Uso
```
npm install
npm start          # abrir la app
npm run selftest   # prueba no destructiva
npm run dist       # crea el instalador en dist/
```

Ábrela como administrador para limpiar restos en Archivos de programa y HKLM. Haz copia de seguridad: borrar archivos y claves puede dañar programas. Barredor guarda copias en %APPDATA%\Barredor.

Licencia MIT. Proyecto creado con ClonaKit.
