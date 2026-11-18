from pypdf import PdfReader

pdf_path = r"C:\Users\User\Desktop\project\TempMate_Normal_Bottle_Two_Day_Project_Report.pdf"
reader = PdfReader(pdf_path)
print(f"pages={len(reader.pages)}")
for i, page in enumerate(reader.pages, 1):
    text = page.extract_text() or ""
    print(f"---PAGE {i}---")
    print(text[:5000])
    print()
