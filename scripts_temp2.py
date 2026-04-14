import os

path = "/Users/leonardomol/PETMOL H1/apps/web/src/components/PetPanel.tsx"
with open(path, "r") as f:
    content = f.read()

new_link = """      {/* Documentos do Pet */}
      <Link
        href={`/documents/1234`}
        className="block w-full p-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-2xl text-center hover:shadow-lg transition-all group"
      >
        <div className="flex items-center justify-center gap-2 font-medium">
          <span>📁</span>
          <span>Documentos — Exames e Laudos</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <p className="text-xs text-blue-100 mt-1">
          Organize laudos, receitas e fotos do pet
        </p>
      </Link>

      {/* RG do Pet */}"""

content = content.replace("{/* RG do Pet */}", new_link)

with open(path, "w") as f:
    f.write(content)
