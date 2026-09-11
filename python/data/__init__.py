# Solo queda `database.py`, y se importa directo (`from data.database import
# get_conn`). El paquete ya no re-exporta nada: el almacenamiento de usuarios,
# grupos, mensajes y stats se fue al userData de Node y a las tablas de Rust.
