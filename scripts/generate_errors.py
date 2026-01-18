import json
import traceback

def trigger_name_error():
    # Undefined variable (Pylance should yell too)
    return file_path + "_config.json"

def trigger_file_not_found():
    # FileNotFoundError
    with open("definitely_not_real_config.json", "r") as f:
        return f.read()

def trigger_json_error():
    # JSONDecodeError
    bad_json = "{ not valid json..."
    return json.loads(bad_json)

def trigger_type_error():
    # TypeError
    config = "not a dict"
    return config["port"]

def trigger_key_error():
    # KeyError
    config = {"host": "localhost"}
    return config["port"]

def trigger_index_error():
    # IndexError
    nums = [1, 2, 3]
    return nums[999]

def trigger_attribute_error():
    # AttributeError
    config = {"port": 8080}
    return config.upper()

def trigger_zero_division():
    # ZeroDivisionError
    return 10 / 0

def trigger_unbound_local():
    # UnboundLocalError
    if False:
        x = 123
    return x

def main():
    print("Booting Watchtower (broken build)...\n")

    tests = [
        ("NameError (undefined variable)", trigger_name_error),
        ("FileNotFoundError (missing file)", trigger_file_not_found),
        ("JSONDecodeError (bad JSON)", trigger_json_error),
        ("TypeError (wrong type usage)", trigger_type_error),
        ("KeyError (missing key)", trigger_key_error),
        ("IndexError (out of range)", trigger_index_error),
        ("AttributeError (wrong attribute)", trigger_attribute_error),
        ("ZeroDivisionError (divide by zero)", trigger_zero_division),
        ("UnboundLocalError (local var not set)", trigger_unbound_local),
    ]

    for title, fn in tests:
        print("=== " + title + " ===")
        try:
            fn()
        except Exception:
            traceback.print_exc()
        print()

    print("Done. (Everything above was intentional.)")

if __name__ == "__main__":
    main()
