import os

def walk_and_replace(directory):
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if '.git' in dirs:
            dirs.remove('.git')
        if '.next' in dirs:
            dirs.remove('.next')
            
        for file in files:
            if file == 'package-lock.json':
                continue
            
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = content.replace('Tskconnect', 'Tskconnect') \
                                     .replace('tskconnect', 'tskconnect') \
                                     .replace('Tskconnect', 'Tskconnect') \
                                     .replace('tskconnect', 'tskconnect') \
                                     .replace('TSKCONNECT', 'TSKCONNECT') \
                                     .replace('Tskconnect', 'Tskconnect') \
                                     .replace('tskconnect', 'tskconnect') \
                                     .replace('TSKCONNECT', 'TSKCONNECT')
                
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated {filepath}")
            except Exception as e:
                pass

if __name__ == '__main__':
    walk_and_replace('.')
    print("Sitewide replacement complete.")
