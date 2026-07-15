def main() -> None:
    """Provide a helpful message when the module is run directly."""
    print("Run the API with: uv run --directory services/api uvicorn app.main:app --reload")


if __name__ == "__main__":
    main()
