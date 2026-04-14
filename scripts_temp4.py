import os

path = "/Users/leonardomol/PETMOL H1/apps/web/src/components/DocumentManager.tsx"
with open(path, "r") as f:
    content = f.read()

old_call = """        // Simulating the API call to our new python backend
        // In production: const response = await fetch('/api/vision/documents/classify', ...)
        const classification = await classifyDocument(base64, petId); """

new_call = """        // Calling actual backend API replacing mock capability
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://petshopbh.com/api';
        const response = await fetch(`${apiUrl}/vision/documents/classify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pet_id: petId,
            image_base64: base64.replace(/^data:image\\/[a-z]+;base64,/, '')
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.detail || `API returned ${response.status}`);
        }
        
        const classification = await response.json();"""

content = content.replace(old_call, new_call)

with open(path, "w") as f:
    f.write(content)
