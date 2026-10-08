use std::{env, fs, io::Read, path::PathBuf, thread, time::Duration};

fn main() {
    let marker = PathBuf::from(env::var_os("SCRIBE_OPEN_TEST_MARKER").expect("Public test marker"));
    let args = env::args().skip(1).collect::<Vec<_>>();
    fs::write(marker.with_extension("args"), args.join("\n")).unwrap();
    assert_eq!(args, ["--open"]);
    fs::write(&marker, std::process::id().to_string()).unwrap();
    let mut input = Vec::new();
    std::io::stdin().read_to_end(&mut input).unwrap();
    assert!(input.is_empty());
    println!("PUBLIC STDOUT SENTINEL");
    eprintln!("PUBLIC STDERR SENTINEL");
    fs::write(marker.with_extension("stdin"), "EOF").unwrap();
    thread::sleep(Duration::from_secs(10));
}
